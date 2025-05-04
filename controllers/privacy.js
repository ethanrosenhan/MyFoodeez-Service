import formData from 'form-data';
import Mailgun from 'mailgun.js';
const mailgun = new Mailgun(formData);

const privacyPage = async (request, response) => {

	return response.status(200).send(`
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Privacy Policy - Foodeez</title>
			<style>
				/* Base Styling */
				body {
					margin: 0;
					font-family: Arial, sans-serif;
					color: rgb(50, 50, 50);
					background-color: rgb(242, 242, 242);
					line-height: 1.6;
				}

				/* Header */
				.header {
					background-color: #2a5335;
					color: white;
					text-align: center;
					padding: 20px;
				}

				.main-title {
					font-size: 28px;
					font-weight: bold;
				}

				.effective-date {
					font-size: 14px;
				}

				/* Main Content */
				.content {
					max-width: 800px;
					margin: 20px auto;
					background: white;
					padding: 20px;
					border-radius: 8px;
					box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
				}

				.content h2 {
					font-size: 24px;
					color: rgb(75, 149, 94);
					border-bottom: 2px solid #2a5335;
					padding-bottom: 5px;
				}

				.content h3 {
					font-size: 20px;
					margin-top: 15px;
					color: rgb(75, 149, 94);
				}

				.content ul {
					list-style-type: disc;
					margin-left: 20px;
				}

				.content ul li {
					margin-bottom: 8px;
				}

				/* Footer */
				.footer {
					text-align: center;
					padding: 10px;
					background-color: #2a5335;
					color: white;
					margin-top: 20px;
					font-size: 14px;
				}
			</style>
		</head>
		<body>
			<header class="header">
				<h1 class="main-title">Privacy Policy</h1>
				<p class="effective-date">Effective Date: 11/1/2024</p>
			</header>

			<main class="content">
				<section>
					<h2>1. Information Collection and Use</h2>
					<p>We may collect personal information to provide and improve our App's functionality. This includes:</p>
					<ul>
						<li>Name</li>
						<li>Email Address</li>
						<li>Location (if permission is granted)</li>
					</ul>
				</section>

				<section>
					<h3>1.1 Personal Data</h3>
					<p>We may collect identifiable information such as your name, email address, and location. Usage data includes IP addresses and device types.</p>
				</section>

				<section>
					<h2>2. Cookies and Tracking</h2>
					<p>Our App uses cookies to monitor activity and enhance the user experience. You may choose to disable cookies in your device settings.</p>
				</section>

				<section>
					<h2>3. Data Usage</h2>
					<p>Personal information may be used to:</p>
					<ul>
						<li>Provide, operate, and maintain our App</li>
						<li>Improve and customize the user experience</li>
						<li>Communicate updates or issues</li>
					</ul>
				</section>

				<section>
					<h2>4. Data Retention</h2>
					<p>We retain personal data only as long as necessary for the purposes outlined in this policy or as required by law.</p>
				</section>

				<section>
					<h2>5. User Rights</h2>
					<p>You have the right to access, update, or delete your personal information. Please contact us to exercise these rights.</p>
				</section>

				<section>
					<h2>6. Changes to This Privacy Policy</h2>
					<p>We may update this Privacy Policy from time to time. Significant changes will be communicated via email or in-app notifications.</p>
				</section>

				<section>
					<h2>7. Contact Us</h2>
					<p>If you have questions, contact us at:</p>
					<p>Email: support@myfoodeez.com</p>

				</section>
			</main>

			<footer class="footer">
				<p>© 2024 Foodeez. All rights reserved.</p>
			</footer>
		</body>
		</html>

	`);
};


export { privacyPage };