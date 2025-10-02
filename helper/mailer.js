// helper/mailer.js
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // you can switch to SMTP if needed
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASS,
  },
});

/**
 * Send an email
 * @param {string} to 
 * @param {string} subject
 * @param {string} text 
 * @param {string} html 
 */
const sendMail = async (to, subject, text, html = null) => {
  try {
    const mailOptions = {
      from: `"Melodia Support" <${process.env.NODEMAILER_EMAIL}>`,
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", info.messageId);
    return info;
  } catch (err) {
    console.error(" Error sending email:", err);
    throw err;
  }
};

module.exports = sendMail;
