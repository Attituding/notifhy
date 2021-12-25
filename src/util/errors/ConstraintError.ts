import { Locale } from '../../@types/locales';

export default class ConstraintError extends Error {
    cooldown?: number;

    constructor(message: keyof Locale['constraints'], cooldown?: number) {
        super(message);
        this.name = 'ConstraintError';
        this.cooldown = cooldown;

        //Thank you to https://www.dannyguo.com/blog/how-to-fix-instanceof-not-working-for-custom-errors-in-typescript/
        Object.setPrototypeOf(this, ConstraintError.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}
