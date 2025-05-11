import formData from 'form-data';
import Mailgun from 'mailgun.js';
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
				body {
					font-family: Arial, sans-serif;
					margin: 0;
					padding: 0;
				}
				.header {
					background-color:rgb(42, 83, 53);
					padding: 20px;
					text-align: center;
					color: white;
				}
				.content {
					padding: 20px;
				}
				.contact-section, .faq-section {
					margin-bottom: 20px;
					color: rgb(75,149,94);
				}
				.support-form {
					display: flex;
					flex-direction: column;
				}
				.support-form label {
					margin-top: 10px;
				}
				.support-form input, .support-form textarea {
					margin-top: 5px;
					padding: 10px;
					font-size: 14px;
				}
				.submit-btn {
					margin-top: 10px;
					padding: 10px;
					background-color:rgb(42, 83, 53);
					color: white;
					border: none;
					cursor: pointer;
					width: 150px; /* Fixed width */
					text-align: center; /* Center text */
					border-radius: 5px; /* Slightly rounded corners */
				}
				.submit-btn:hover {
					background-color: rgb(60, 100, 70); /* Slightly lighter hover color */
				}
				.footer {
					background-color: #f8f9fa;
					text-align: center;
					padding: 10px;
					margin-top: 20px;
				}
			</style>
		</head>
		<body>
			<header class="header">
				<h1>Support</h1>
				<p>We’re here to help! Reach out with your questions or concerns.</p>
			</header>

			<main class="content">
				<section class="contact-section">
					<h2>Contact Us</h2>
					<p>If you have an issue or need support, email us directly at:</p>
					<p class="email">support@myfoodeez.com</p>

					<h3>Send Us a Message</h3>
					<form class="support-form" action="/support/submit" method="post">
						<label for="email">Your Email</label>
						<input type="email" id="email" name="email" placeholder="Enter your email" required>

						<label for="message">Your Message</label>
						<textarea id="message" name="message" rows="5" placeholder="Describe your issue or question" required></textarea>

						<button type="submit" class="submit-btn">Submit</button>
					</form>
				</section>

				<section class="faq-section">
					<h2>Frequently Asked Questions</h2>
					<div class="faq">
						<h4>How do I reset my password?</h4>
						<p>Go to the login page, click "Forgot Password," and follow the instructions to reset your password.</p>
					</div>
					<div class="faq">
						<h4>How can I update my profile information?</h4>
						<p>Log in to your account, navigate to "Settings," and edit your profile details.</p>
					</div>
					<div class="faq">
						<h4>How do I delete my account?</h4>
						<p>Log in to your account, navigate to "Settings," and choose the "Delete Account" button.</p>
					</div>
				</section>
			</main>

			<footer class="footer">
				<p>© 2024 MyFoodeez. All rights reserved.</p>
			</footer>
		</body>
		</html>
	`);
};

const supportSubmit = async (request, response) => {

	const { email, message } = request.body; // Retrieve email and message from the request body
	console.log(`Support Request Received: Email - ${email}, Message - ${message}`); // Log the values

	const mg = mailgun.client({username: 'api', key: process.env.MAILGUN_API_KEY });
	const mgResponse = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
		from: process.env.PASSWORD_CHANGE_FROM_EMAIL,
		to: process.env.SUPPORT_RECEIVED_TO_EMAIL,
		subject: "MyFoodeez Support Email Received",
		text: "Email: " + email + "\nMessage: " + message,
		html: `<p>${email}</p><p>${message}</p>`
	});

	return response.status(200).send(`
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Support Submission</title>
			<style>
				body {
					font-family: Arial, sans-serif;
					margin: 0;
					padding: 0;
					text-align: center;
					background-color: #f8f9fa;
				}
				.message {
					margin-top: 50px;
					padding: 20px;
					background-color: white;
					display: inline-block;
					border-radius: 8px;
					box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
				}
				h1 {
					color: rgb(42, 83, 53);
				}
			</style>
		</head>
		<body>
			<div class="message">
				<h1>Your request has been submitted</h1>
				<p>Our support team will be in touch. Thank You.</p>
			</div>
		</body>
		</html>
	`);
};

export { supportPage, supportSubmit };