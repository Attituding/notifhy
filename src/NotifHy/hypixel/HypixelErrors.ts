import {
    clearTimeout,
    setTimeout,
} from 'node:timers';
import { RequestManager } from './RequestManager';
import Constants from '../util/Constants';

type ErrorType = {
    baseTimeout: number;
    lastMinute: number;
    resetTimeout: number | undefined;
    timeout: number;
    total: number;
}

export class HypixelErrors {
    request: RequestManager;

    resumeAfter: number;

    readonly abort: ErrorType;

    readonly rateLimit: {
        isGlobal: boolean
    } & ErrorType;

    readonly error: ErrorType;

    constructor(request: RequestManager) {
        this.request = request;

        this.resumeAfter = 0;

        this.abort = {
            baseTimeout: 0, //The timeout each type starts out with
            lastMinute: 0, //Each type's incident count for the last minute
            resetTimeout: undefined, //A setTimeout to reset the timeout length
            timeout: 0, //The current timeout of each type; this is to be added onto <Instance>.resumeAfter
            total: 0, //Total incidents for this session
        };

        this.rateLimit = {
            baseTimeout: Constants.ms.minute,
            lastMinute: 0,
            timeout: Constants.ms.minute,
            resetTimeout: undefined,
            total: 0,
            isGlobal: false,
        };

        this.error = {
            baseTimeout: Constants.ms.minute / 2,
            lastMinute: 0,
            timeout: Constants.ms.minute / 2,
            resetTimeout: undefined,
            total: 0,
        };
    }

    addAbort() {
        this.base({
            type: 'abort',
        });
    }

    addRateLimit({
        rateLimitGlobal,
        ratelimitReset,
    }: {
        rateLimitGlobal: boolean | null,
        ratelimitReset: string | null;
    }) {
        if (ratelimitReset) {
            this.rateLimit.timeout =
                (Number(ratelimitReset) + 1) * Constants.ms.second;
        }

        this.rateLimit.isGlobal = rateLimitGlobal ?? this.rateLimit.isGlobal;
        this.request.keyPercentage -= 0.05;
        this.base({
            type: 'rateLimit',
        });
    }

    addError() {
        this.base({
            type: 'error',
        });
    }

    isTimeout() {
        return this.resumeAfter > Date.now();
    }

    getTimeout() {
        return this.isTimeout()
            ? this.resumeAfter - Date.now()
            : 0;
    }

    private base({ type }: { type: 'abort' | 'rateLimit' | 'error' }) {
        this.resumeAfter = Math.max(
            this.resumeAfter,
            Date.now() + this[type].timeout,
        ); //Sets the new delay by setting <Instance>.resumeAfter

        const newTimeout = this[type].timeout * 2 || Constants.ms.minute / 2;

        this[type].timeout = newTimeout; //Setting new timeout

        this[type].total += 1;

        this[type].lastMinute += 1; //Adding a count to the error type

        setTimeout(() => {
            this[type].lastMinute -= 1; //Removing a type from the count
        }, Constants.ms.minute);

        if (this[type].resetTimeout !== undefined) {
            //Clears the type's existing timeout, if any
            clearTimeout(this[type].resetTimeout);
        }

        this[type].resetTimeout = setTimeout(() => {
            //Returns type number rather than NodeJS.timeout
            this[type].timeout = this[type].baseTimeout; //Sets a timeout to set the timeout back to "0"
        }, newTimeout + Constants.ms.minute) as unknown as number;
    }
}