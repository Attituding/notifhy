import { CommandInteraction } from 'discord.js';
import { type UserData } from '../@types/database';
import { formattedUnix } from './utility';

export class Log {
    private static base(type: string) {
        const time = formattedUnix({ date: true, utc: true });
        return `${time} [${type}]`;
    }

    public static error(...text: unknown[]) {
        console.error(this.base('ERROR'), ...text);
    }

    public static interaction(interaction: CommandInteraction, ...text: unknown[]) {
        console.log(this.base('INTERACTION'), interaction.id, interaction.user.id, ...text);
    }

    public static log(...text: unknown[]) {
        console.log(this.base('LOG'), ...text);
    }

    public static module(module: string, user: UserData, ...text: unknown[]) {
        const moduleName = `[${module.toUpperCase()}]`;
        console.log(this.base('MODULES'), moduleName, user.discordID, ...text);
    }

    public static request(...text: unknown[]) {
        console.log(this.base('REQUEST'), ...text);
    }
}