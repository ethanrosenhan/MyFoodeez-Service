const health = async (request, response) => {
	return response.status(200).json({ ok: true });
};

const version = async (request, response) => {
	const commit =
		process.env.GIT_COMMIT ||
		process.env.COMMIT_SHA ||
		process.env.RENDER_GIT_COMMIT ||
		'unknown';

	return response.status(200).json({
		service: process.env.SERVICE_NAME || 'myfoodeez-service',
		commit: commit,
		timestamp: new Date().toISOString()
	});
};

export { health, version };
