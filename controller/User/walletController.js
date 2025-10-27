import walletService from '../../services/walletService.js';
import referralService from '../../services/referralService.js';
import User from '../../model/userSchema.js';

// Get wallet balance
export const getWalletBalance = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const balance = await walletService.getBalance(userId);
        
        res.json({
            success: true,
            balance: balance
        });
    } catch (error) {
        console.error('Error getting wallet balance:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get wallet balance'
        });
    }
};

// Get transaction history
export const getTransactionHistory = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const filters = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20,
            type: req.query.type,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        };

        const result = await walletService.getTransactionHistory(userId, filters);
        
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error getting transaction history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get transaction history'
        });
    }
};

// Validate wallet payment
export const validateWalletPayment = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount'
            });
        }

        const validation = await walletService.validateWalletPayment(userId, amount);
        
        res.json({
            success: validation.valid,
            message: validation.message,
            currentBalance: validation.currentBalance,
            requiredAmount: validation.requiredAmount
        });
    } catch (error) {
        console.error('Error validating wallet payment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate wallet payment'
        });
    }
};

// Get wallet page
export const getWalletPage = async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Get user data
        const user = await User.findById(userId).select('name email wallet referralCode');
        if (!user) {
            return res.redirect('/login');
        }

        // Ensure user has a referral code
        if (!user.referralCode) {
            user.referralCode = user.generateReferralCode();
            await user.save();
        }

        // Get wallet balance
        const balance = await walletService.getBalance(userId);
        
        // Get recent transactions (last 10)
        const recentTransactions = await walletService.getTransactionHistory(userId, { 
            page: 1, 
            limit: 10 
        });
        
        // Get referral stats
        const referralStats = await referralService.getReferralStats(userId);

        res.render('user/wallet', {
            title: 'My Wallet',
            user: user,
            walletBalance: balance,
            transactions: recentTransactions.transactions,
            pagination: recentTransactions.pagination,
            referralStats: referralStats.success ? referralStats.stats : null
        });
    } catch (error) {
        console.error('Error loading wallet page:', error);
        res.status(500).render('error/500');
    }
};

// Get referral stats
export const getReferralStats = async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // First, ensure user has a referral code
        const userForReferral = await User.findById(userId);
        if (!userForReferral.referralCode) {
            userForReferral.referralCode = userForReferral.generateReferralCode();
            await userForReferral.save();
        }
        
        const result = await referralService.getReferralStats(userId);
        res.json(result);
    } catch (error) {
        console.error('Error getting referral stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get referral stats'
        });
    }
};

export default {
    getWalletBalance,
    getTransactionHistory,
    validateWalletPayment,
    getWalletPage,
    getReferralStats
};