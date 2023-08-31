import  {models} from '../utils/database.js';

/**********************************************************/
const addAudit = async (request, eventType, data={}) => {

	const audit = models.audit.build({
        event_type: eventType,
        audit_timestamp: new Date(),
        ip_address: getIpAddress(request),
        useragent: request.get('User-Agent'),
        data: data,
        user_id: request.user ? request.user.id : null
    });
    await audit.save();

}
const getIpAddress = (request)=> {
	return request.headers['x-forwarded-for'] || request.connection.remoteAddress;
}
export  { addAudit, getIpAddress };
