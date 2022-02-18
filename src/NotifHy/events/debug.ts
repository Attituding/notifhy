import type { ClientEvent } from '../@types/client';
import { Log } from '../../util/Log';

export const properties: ClientEvent['properties'] = {
    name: 'debug',
    once: false,
};

export const execute: ClientEvent['execute'] = (info: string): void => {
    return;
    Log.debug(info);
};