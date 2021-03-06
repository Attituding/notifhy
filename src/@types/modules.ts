import { type Client } from 'discord.js';
import {
    type UserAPIData,
    type UserData,
} from './database';
import {
    type CleanHypixelPlayer,
    type CleanHypixelStatus,
} from './hypixel';
import { type Locale } from './locales';

/* eslint-disable no-unused-vars */

export type ModuleNames = 'defender' | 'friend' | 'rewards';

export type ModuleDifferences = {
    newData: Partial<CleanHypixelPlayer & CleanHypixelStatus>,
    oldData: Partial<CleanHypixelPlayer & CleanHypixelStatus>,
};

export interface ClientModule {
    properties: {
        name: string,
        cleanName: string,
        onlineStatusAPI: boolean,
    },
    execute(
        {
            client,
            differences,
            baseLocale,
            userAPIData,
            userData,
        }: {
            client: Client,
            differences: ModuleDifferences,
            baseLocale: Locale['modules'],
            userAPIData: UserAPIData,
            userData: UserData,
        }
    ): Promise<void>,
}