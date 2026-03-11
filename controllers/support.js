import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { sendError } from '../lib/response-helper.js';

const mailgun = new Mailgun(formData);

const supportPage = async (request, response) => {
    return response.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Support - MyFoodeez</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
                .header { background-color: rgb(42, 83, 53); padding: 20px; text-align: center; color: white; }
                .content { padding: 20px; }
                .contact-section { margin-bottom: 20px; color: rgb(75,149,94); }
                .support-form { display: flex; flex-direction: column; }
                .support-form label { margin-top: 10px; }
                .support-form input, .support-form textarea { margin-top: 5px; padding: 10px; font-size: 14px; }
                .submit-btn { margin-top: 10px; padding: 10px; background-color: rgb(42, 83, 53); color: white; border: none; cursor: pointer; width: 150px; text-align: center; border-radius: 5px; }
                .footer { background-color: #f8f9fa; text-align: center; padding: 10px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <header class="header">
                <h1>Support</h1>
                <p>We're here to help. Reach out with your questions or concerns.</p>
            </header>
            <main class="content">
                <section class="contact-section">
                    <h2>Contact Us</h2>
                    <p>If you have an issue or need support, email us directly at support@myfoodeez.com</p>
                    <form class="support-form" action="/support/submit" method="post">
                        <label for="email">Your Email</label>
                        <input type="email" id="email" name="email" placeholder="Enter your email" required>
                        <label for="message">Your Message</label>
                        <textarea id="message" name="message" rows="5" placeholder="Describe your issue or question" required></textarea>
                        <button type="submit" class="submit-btn">Submit</button>
                    </form>
                </section>
            </main>
            <footer class="footer">
                <p>&copy; 2026 MyFoodeez. All rights reserved.</p>
            </footer>
        </body>
        </html>
    `);
};

const supportSubmit = async (request, response) => {
    const email = request.body?.email?.trim();
    const message = request.body?.message?.trim();

    if (!email || !message) {
        return sendError(response, 400, 'Email and message are required', 'invalid_request');
    }

    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN && process.env.SUPPORT_RECEIVED_TO_EMAIL) {
        const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });
        await mg.messages.create(process.env.MAILGUN_DOMAIN, {
            from: process.env.PASSWORD_CHANGE_FROM_EMAIL || process.env.SIGNUP_FROM_EMAIL,
            to: process.env.SUPPORT_RECEIVED_TO_EMAIL,
            subject: 'MyFoodeez Support Email Received',
            text: `Email: ${email}\nMessage: ${message}`,
            html: `<p>${email}</p><p>${message}</p>`
        });
    }

    return response.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Support Submission</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; text-align: center; background-color: #f8f9fa; }
                .message { margin-top: 50px; padding: 20px; background-color: white; display: inline-block; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); }
                h1 { color: rgb(42, 83, 53); }
            </style>
        </head>
        <body>
            <div class="message">
                <h1>Your request has been submitted</h1>
                <p>Our support team will be in touch. Thank you.</p>
            </div>
        </body>
        </html>
    `);
};

export { supportPage, supportSubmit };
