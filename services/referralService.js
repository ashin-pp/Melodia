import User from '../model/userSchema.js';
import walletService from './walletService.js';
import crypto from 'crypto';

export const referralService = {
    generateReferralToken: (userId) => {
        return crypto.createHash('sha256').update(userId + Date.now()).digest('hex').substring(0, 16);
    },

        validateReferralCode: async (referralCode) => {
        try {
            if (!referralCode) return { valid: false, message: 'Referral code is required' };

            const codeRegex = /^[A-Z0-9]{8}$/;
            if (!codeRegex.test(referralCode.toUpperCase())) {
                return { valid: false, message: 'Invalid referral code format' };
            }

            const referrer = await User.findOne({
                referralCode: referralCode.toUpperCase(),
                isBlocked: false 
            }).select('_id name referralCode isBlocked referrals referralStats');

            if (!referrer) {
                return { valid: false, message: 'Invalid referral code' };
            }

            if (referrer.isBlocked) {
                return { valid: false, message: 'Referral code is no longer valid' };
            }

            return {
                valid: true,
                referrer: {
                    _id: referrer._id,
                    name: referrer.name,
                    referralCode: referrer.referralCode
                }
            };
        } catch (error) {
            console.error('Error validating referral code:', error);
            return { valid: false, message: 'Validation failed' };
        }
    },

    processReferral: async (newUserId, referralCode) => {
        try {
            if (!referralCode) return { success: false, message: 'No referral code provided' };

            const validation = await referralService.validateReferralCode(referralCode);
            if (!validation.valid) {
                return { success: false, message: validation.message };
            }

            const referrer = await User.findOne({
                referralCode: referralCode.toUpperCase(),
                isBlocked: false
            });

            if (!referrer) {
                return { success: false, message: 'Invalid referral code' };
            }

            const newUser = await User.findById(newUserId);

            if (!newUser) {
                return { success: false, message: 'New user not found' };
            }

            console.log('Processing referral for new user:', newUserId);

            if (referrer._id.toString() === newUserId.toString()) {
                return { success: false, message: 'Cannot use your own referral code' };
            }

            if (newUser.referredBy) {
                return { success: false, message: 'User already has a referrer' };
            }

            if (!referrer.referrals) {
                referrer.referrals = [];
            }
            if (!referrer.referralStats) {
                referrer.referralStats = { totalReferrals: 0, totalRewards: 0 };
            }

            const existingReferral = referrer.referrals.find(
                ref => ref.userId.toString() === newUserId.toString()
            );
            if (existingReferral) {
                return { success: false, message: 'Referral already processed' };
            }

            newUser.referredBy = referrer._id;
            await newUser.save();

            const MAX_REFERRALS_PER_DAY = 10;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayReferrals = referrer.referrals.filter(ref => {
                const refDate = new Date(ref.joinedAt);
                refDate.setHours(0, 0, 0, 0);
                return refDate.getTime() === today.getTime();
            });

            if (todayReferrals.length >= MAX_REFERRALS_PER_DAY) {
                return { success: false, message: 'Daily referral limit reached' };
            }

            referrer.referrals.push({
                userId: newUserId,
                joinedAt: new Date(),
                rewardGiven: false 
            });
            referrer.referralStats.totalReferrals += 1;
            await referrer.save();

            const rewardResult = await referralService.processWalletRewards(referrer._id, newUserId, newUser.name);

            return {
                success: true,
                message: 'Referral processed successfully',
                reward: rewardResult,
                referrer: {
                    id: referrer._id,
                    name: referrer.name
                }
            };

        } catch (error) {
            return { success: false, message: 'Failed to process referral' };
        }
    },

    processWalletRewards: async (referrerId, newUserId, newUserName) => {
        try {
            console.log('Processing wallet rewards for referral');

            const referrerReward = await walletService.addMoney(
                referrerId,
                200,
                `Referral bonus for inviting ${newUserName}`,
                null,
                null
            );

            const newUserReward = await walletService.addMoney(
                newUserId,
                100,
                'Welcome bonus for joining via referral',
                null,
                null
            );

            const referrer = await User.findById(referrerId);
            if (referrer) {
                if (!referrer.referralStats) {
                    referrer.referralStats = { totalReferrals: 0, totalRewards: 0 };
                }
                
                referrer.referralStats.totalRewards += 200;

                const referralIndex = referrer.referrals.findIndex(
                    ref => ref.userId.toString() === newUserId.toString()
                );

                if (referralIndex !== -1) {
                    referrer.referrals[referralIndex].rewardGiven = true;
                }

                await referrer.save();
            }

            const result = {
                success: true,
                referrerReward: referrerReward.success ? 200 : 0,
                newUserReward: newUserReward.success ? 100 : 0,
                referrerBalance: referrerReward.newBalance,
                newUserBalance: newUserReward.newBalance,
                referrerRewardSuccess: referrerReward.success,
                newUserRewardSuccess: newUserReward.success
            };

            console.log('Wallet rewards processed successfully');
            return result;

        } catch (error) {
            console.error(' Error processing wallet rewards:', error);
            return { success: false, message: 'Failed to process rewards', error: error.message };
        }
    },

    getReferralStats: async (userId) => {
        try {
            const user = await User.findById(userId)
                .populate('referrals.userId', 'name email createdOn')
                .select('referralCode referrals referralStats');

            if (!user) {
                return { success: false, message: 'User not found' };
            }

            if (!user.referralCode) {
                user.referralCode = user.generateReferralCode();
                await user.save();
            }
            const sortedReferrals=user.referrals?
            user.referrals.sort((a,b)=>new Date(b.joinedAt)-new Date(a.joinedAt)):[];

            return {
                success: true,
                stats: {
                    referralCode: user.referralCode,
                    totalReferrals: user.referralStats?.totalReferrals || 0,
                    totalRewards: user.referralStats?.totalRewards || 0,
                    referrals: sortedReferrals
                }
            };

        } catch (error) {
            console.error('Error getting referral stats:', error);
            return { success: false, message: 'Failed to get stats' };
        }
    },

    // Generate referral URL
    generateReferralUrl: (referralCode, baseUrl = 'http://localhost:3000') => {
        return `${baseUrl}/signup?ref=${referralCode}`;
    },

    // Get referral leaderboard
    getReferralLeaderboard: async (limit = 10) => {
        try {
            const leaderboard = await User.find({
                'referralStats.totalReferrals': { $gt: 0 }
            })
                .select('name referralCode referralStats')
                .sort({ 'referralStats.totalReferrals': -1 })
                .limit(limit);

            return {
                success: true,
                leaderboard: leaderboard
            };

        } catch (error) {
            console.error('Error getting referral leaderboard:', error);
            return { success: false, message: 'Failed to get leaderboard' };
        }
    },

    // Get referral analytics for admin
    getReferralAnalytics: async () => {
        try {
            const analytics = await User.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        usersWithReferrals: {
                            $sum: {
                                $cond: [{ $gt: ['$referralStats.totalReferrals', 0] }, 1, 0]
                            }
                        },
                        totalReferrals: { $sum: '$referralStats.totalReferrals' },
                        totalRewardsGiven: { $sum: '$referralStats.totalRewards' },
                        usersReferred: {
                            $sum: {
                                $cond: [{ $ne: ['$referredBy', null] }, 1, 0]
                            }
                        }
                    }
                }
            ]);

            const result = analytics[0] || {
                totalUsers: 0,
                usersWithReferrals: 0,
                totalReferrals: 0,
                totalRewardsGiven: 0,
                usersReferred: 0
            };

            // Calculate referral rate
            result.referralRate = result.totalUsers > 0
                ? ((result.usersReferred / result.totalUsers) * 100).toFixed(2)
                : 0;

            return {
                success: true,
                analytics: result
            };

        } catch (error) {
            console.error('Error getting referral analytics:', error);
            return { success: false, message: 'Failed to get analytics' };
        }
    }
};

export default referralService;