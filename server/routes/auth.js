import express, { query } from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import User from '../model/User';
import { body, validationResult } from 'express-validator';
import passport from 'passport';   
import Organization from '../model/Organization';
import { getCompanyInfoFromDomain } from '../task_processor';



var router = express.Router();

const sanitizeRedirectPath = (target) => {
  if (!target || typeof target !== 'string') {
    return undefined;
  }
  if (!target.startsWith('/')) {
    return undefined;
  }
  if (target.startsWith('//')) {
    return undefined;
  }
  return target;
};

const consumeRedirectFromSession = (req) => {
  if (!req.session) {
    return undefined;
  }
  const redirectPath = sanitizeRedirectPath(req.session.redirectAfterLogin);
  delete req.session.redirectAfterLogin;
  return redirectPath;
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

router.get('/test', async function(req, res, next) {
    try{
        res.status(200).json({message: "WORKD"})
    }catch(error){
        res.status(501).json({message: "Error", error: error})
    }
})


router.post(
  '/forgot',
  body('email').isEmail().withMessage('Valid email required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email } = req.body;
    try {
      const user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        // For security, do NOT reveal that the email isn’t registered.
        return res
          .status(200)
          .json({ message: 'If that email is registered, you’ll receive a reset link.' });
      }

      // 1. Generate a token:
      const token = crypto.randomBytes(20).toString('hex');

      // 2. Save token + expiry (e.g. 1 hour) on user:
      user.resetPasswordToken = token;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
      await user.save();

      // 3. Send email with link (you’ll have to create an email template):
      const resetUrl = `${process.env.APP_BASE_URL}/reset/${token}`;
      const mailOptions = {
        to: user.email,
        from: process.env.FROM_EMAIL, // e.g. '"YourApp Support" <support@yourapp.com>'
        subject: 'Password Reset',
        text: `You are receiving this because you (or someone else) requested a password reset for your account.\n\n
Please click on the following link, or paste this into your browser to complete the process within one hour of receiving it:\n\n
${resetUrl}\n\n
If you did not request this, please ignore this email and your password will remain unchanged.\n`,
      };

      console.log(mailOptions)
      //await transporter.sendMail(mailOptions);
      return res
        .status(200)
        .json({ message: 'If that email is registered, you’ll receive a reset link.' });
    } catch (err) {
      console.error('Error in /auth/forgot:', err);
      return res.status(500).json({ error: 'Error sending reset email.' });
    }
  }
);

// ===== 6b. “Show Reset Form” (GET) – you’ll render front-end with the token =====
// e.g. GET /auth/reset/:token
// In a typical SPA, you might just let the front-end capture the token from the URL
// and render a “New Password” form. You might not need a server-side GET at all.
// For a server-rendered page, you would do something like:
//
// router.get('/auth/reset/:token', async (req, res) => {
//   const user = await User.findOne({
//     resetPasswordToken: req.params.token,
//     resetPasswordExpires: { $gt: Date.now() },
//   });
//   if (!user) {
//     return res.redirect('/auth/forgot?error=TokenExpired');
//   }
//   // Render an HTML form that POSTs to /auth/reset/:token
//   res.render('reset-password', { token: req.params.token });
// });

// ===== 6c. “Handle New Password Submission” (POST) =====
router.post(
  '/reset/:token',
  body('password').isLength({ min: 6 }).withMessage('Password ≥ 6 chars'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // 1. Find the user by token & ensure not expired:
      const user = await User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: Date.now() },
      });
      if (!user) {
        return res.status(400).json({ error: 'Password reset token is invalid or has expired.' });
      }

      // 2. “Set” the new password via passport-local-mongoose:
      await user.setPassword(req.body.password);
      // 3. Clear the reset token fields:
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      // 4. (Optional) Log them in immediately:
      req.logIn(user, (err) => {
        if (err) {
          console.error('Error logging in after password reset:', err);
          return res
            .status(500)
            .json({ message: 'Password was reset, but automatic login failed.' });
        }
        return res.json({ message: 'Password reset successful. You are now logged in.' });
      });
    } catch (err) {
      console.error('Error in POST /auth/reset/:token:', err);
      return res.status(500).json({ error: 'Could not reset password.' });
    }
  }
);

router.post(
  '/register',
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password ≥ 6 chars'),
  body('name').notEmpty().withMessage('Name is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password, name } = req.body;
      const normalized = email.toLowerCase().trim();

      // Check if a user already exists with that email:
      const existing = await User.findOne({ email: normalized });
      if (existing) {
        return res
          .status(400)
          .json({ error: 'Email already in use. Try logging in instead.' });
      }

      const newUser = await User.register(
        new User({ email: normalized, name, external: true,googleId: null }),
        password
      );
      // At this point, newUser.hash & newUser.salt are set behind-the-scenes

      // Log them in immediately:
      req.login(newUser, async (err) => {
        if (err) {
          console.error('Login after register failed:', err);
          return res.status(500).json({ error: 'Login failed.' });
        }
        try{

          const orgName = `${name.split(" ").at(0) ?? "User"}'s Organization`
          const domain = normalized.split("@").at(1)
          const companyInfo = await getCompanyInfoFromDomain( domain )
          Organization.create({
            name: companyInfo?.name ?? orgName,
            companyUrl: domain,
            avatarUrl: companyInfo?.logo,
            members: [{
              user: newUser.id,
              role: "owner"
            }]        
            
          })
          return res.status(201).json({
            message: 'Registered successfully',
            user: {
              _id: newUser._id,
              email: newUser.email,
              name: newUser.name,
              avatarUrl: newUser.avatarUrl,
            },
          });
        }catch(err){
          console.error('Registration error:', err);
          return res.status(500).json({ error: 'Registration failed.' });

        }
      });
    } catch (err) {
      console.error('Registration error:', err);
      return res.status(500).json({ error: 'Registration failed.' });
    }
  }
);

router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
      if (err) {
        return res.status(500).json({ error: 'Server error during login.' });
      }
      if (!user) {
        return res
          .status(401)
          .json({ error: info.message || 'Invalid credentials.' });
      }
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Could not log in.' });
        }
        const redirectPath = consumeRedirectFromSession(req);
        const responseBody = {
          message: 'Login successful',
          user: {
            _id: user._id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
        };
        if (redirectPath) {
          responseBody.redirect = redirectPath;
        }
        return res.json(responseBody);
      });
    })(req, res, next);
  });
export default router;
