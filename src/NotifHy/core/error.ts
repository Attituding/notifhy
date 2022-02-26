import { GlobalConstants } from '../../utility/Constants';
import { Timeout } from '../../utility/Timeout';

export class CoreError {
    isGlobal: boolean;

    readonly abort: Timeout;
    readonly http: Timeout;
    readonly ratelimit: Timeout;
    readonly generic: Timeout;

    constructor() {
        this.isGlobal = false;

        this.abort = new Timeout({ baseTimeout: 0 });
        this.generic = new Timeout({ baseTimeout: 30_000 });
        this.http = new Timeout({ baseTimeout: 30_000 });
        this.ratelimit = new Timeout({ baseTimeout: 30_000 });


        this.addAbort = this.addAbort.bind(this);
        this.addGeneric = this.addGeneric.bind(this);
        this.addHTTP = this.addHTTP.bind(this);
        this.addRateLimit = this.addRateLimit.bind(this);
        this.isTimeout = this.isTimeout.bind(this);
        this.getTimeout = this.getTimeout.bind(this);
    }

    addAbort() {
        this.abort.addError();
    }

    addGeneric() {
        this.generic.addError();
    }

    addHTTP() {
        this.http.addError();
    }

    addRateLimit({
        rateLimitGlobal,
        ratelimitReset,
    }: {
        rateLimitGlobal: boolean | null,
        ratelimitReset: string | null;
    }) {
        if (ratelimitReset !== null) {
            this.ratelimit.timeout =
                (Number(ratelimitReset) + 1) * GlobalConstants.ms.second;
        }

        this.isGlobal = rateLimitGlobal ?? this.isGlobal;
        this.ratelimit.addError();
    }

    isTimeout() {
        return (
            this.abort.isTimeout() ||
            this.generic.isTimeout() ||
            this.http.isTimeout() ||
            this.ratelimit.isTimeout()
        );
    }

    getTimeout() {
        return this.isTimeout()
            ? Math.max(
                this.abort.pauseFor,
                this.generic.pauseFor,
                this.http.pauseFor,
                this.ratelimit.pauseFor,
            )
            : 0;
    }
}