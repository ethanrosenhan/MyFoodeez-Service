import PasswordValidator from 'password-validator';
import bcrypt from 'bcryptjs';
/**********************************************************/
const getPasswordValidator =  () => {
    const passwordValidator = new PasswordValidator();
    passwordValidator.is().min(8)                          // Minimum length 8
	.is().max(100)                                  // Maximum length 100
	.has().uppercase()                              // Must have uppercase letters
	.has().lowercase()                              // Must have lowercase letters
	.has().digits()                                 // Must have digits
	.has().not().spaces()                           // Should not have spaces
	.is().not().oneOf(['Passw0rd', 'Password123']);

    return passwordValidator;

}
/**********************************************************/
const getPasswordHash =  async (password) => {
    const passwordHash =  await bcrypt.hash(password, 12);
    return passwordHash;
}
export  { getPasswordValidator , getPasswordHash};
