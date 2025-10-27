import Razorpay from 'razorpay';
import dotenv from 'dotenv';

dotenv.config();

// Check if Razorpay keys are provided
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

let razorpay = null;

if (razorpayKeyId && razorpayKeySecret && razorpayKeyId !== 'your_razorpay_key_id_here') {
    razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret
    });
    console.log(' Razorpay initialized successfully');
} else {
    console.log(' Razorpay keys not configured. Payment features will be disabled.');
    console.log('   Please add your Razorpay keys to .env file to enable payments.');
}

export default razorpay;