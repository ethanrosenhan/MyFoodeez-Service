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
				<p class="effective-date">Effective Date: September 25, 2026</p>
			</header>

			<main class="content">
				<section>
					<h2>1. Information Collection and Use</h2>
					<p>MyFoodeez LLC processes information needed to provide and protect MyFoodeez. This includes:</p>
					<ul>
						<li>Account information such as name, email address, authentication identifiers, profile photo, and settings</li>
						<li>User content such as meal photos and videos, ratings, notes, dishes, restaurant selections, reactions, collaborative posts, and reports</li>
						<li>Device location when permission is granted for nearby suggestions, plus restaurant locations attached to posts</li>
						<li>Push-notification tokens, app and operating-system information, security logs, and limited diagnostics</li>
						<li>Messages and attachments sent to support</li>
					</ul>
				</section>

				<section>
					<h3>1.1 Personal Data</h3>
					<p>We use this information to provide accounts, posts, restaurant discovery, social and collaborative features, menu scanning, notifications, support, security, moderation, and account deletion.</p>
				</section>

				<section>
					<h2>2. Service Providers and Sharing</h2>
					<p>We do not sell personal information. We share limited information only as needed with providers that support cloud hosting and storage, authentication, maps and restaurant search, media delivery, menu processing, email, and push notifications. Public posts and public profile information are visible to other users and may appear on shareable MyFoodeez pages.</p>
				</section>

				<section>
					<h2>3. Data Usage</h2>
					<p>Personal information may be used to:</p>
					<ul>
						<li>Provide, operate, and maintain our App</li>
						<li>Improve and customize the user experience</li>
						<li>Communicate updates or issues</li>
						<li>Review reports, prevent abuse, and protect users</li>
					</ul>
				</section>

				<section>
					<h2>4. Data Retention</h2>
					<p>We retain personal data only as long as necessary for the purposes outlined in this policy or as required by law.</p>
				</section>

				<section>
					<h2>5. User Rights</h2>
					<p>You can update profile and privacy settings, block users, report inappropriate content, revoke device permissions, or delete your account from the app. Contact us for other privacy requests.</p>
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
				<p>© 2026 MyFoodeez LLC. All rights reserved.</p>
			</footer>
		</body>
		</html>

	`);
};


export { privacyPage };
