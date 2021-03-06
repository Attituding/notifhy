import {
    Collection,
    type CommandInteraction,
} from 'discord.js';
import {
    type ClientCommand,
    type ClientEvent,
} from '../@types/client';
import {
    type UserAPIData,
    type UserData,
} from '../@types/database';
import { ConstraintError } from '../errors/ConstraintError';
import { InteractionConstraintErrorHandler } from '../errors/InteractionConstraintErrorHandler';
import { CommandErrorHandler } from '../errors/InteractionErrorHandler';
import {
    locales,
    RegionLocales,
} from '../locales/RegionLocales';
import { Constants } from '../utility/Constants';
import { Log } from '../utility/Log';
import { SQLite } from '../utility/SQLite';
import {
    BetterEmbed,
    slashCommandResolver,
} from '../utility/utility';

const ownerIDs = JSON.parse(process.env.OWNERS!);

export const properties: ClientEvent['properties'] = {
    name: 'interactionCreate',
    once: false,
    rest: false,
};

export const execute: ClientEvent['execute'] = async (
    interaction: CommandInteraction,
): Promise<void> => {
    let userData: UserData | void;

    try {
        if (interaction.isChatInputCommand()) {
            const command: ClientCommand | undefined = interaction.client.commands.get(
                interaction.commandName,
            );

            if (typeof command === 'undefined') {
                return;
            }

            Log.interaction(interaction, slashCommandResolver(interaction));

            await interaction.deferReply({
                ephemeral: command.properties.ephemeral
                    && interaction.inGuild(),
            });

            userData = SQLite.getUser<UserData>({
                discordID: interaction.user.id,
                table: Constants.tables.users,
                allowUndefined: true,
                columns: ['*'],
            });

            userData ??= SQLite.newUser<UserData>({
                table: Constants.tables.users,
                returnNew: true,
                data: {
                    discordID: interaction.user.id,
                },
            });

            updateLocale(interaction, userData);
            generalConstraints(interaction, command);
            cooldownConstraint(interaction, command);

            await command.execute(
                interaction,
                userData.locale,
            );

            await checkSystemMessages(
                interaction,
                userData,
                userData.locale,
            );
        }
    } catch (error) {
        if (error instanceof ConstraintError) {
            await InteractionConstraintErrorHandler.init(
                error,
                interaction,
                userData?.locale
                ?? Constants.defaults.language,
            );
        } else {
            await CommandErrorHandler.init(
                error,
                interaction,
                userData?.locale
                ?? Constants.defaults.language,
            );
        }
    }
};

function updateLocale(
    interaction: CommandInteraction,
    userData: UserData,
) {
    if (
        interaction.locale !== userData.locale
        && userData.localeOverride === false
        && Object.keys(locales).includes(interaction.locale)
    ) {
        SQLite.updateUser<UserData>({
            discordID: interaction.user.id,
            table: Constants.tables.users,
            data: {
                locale: interaction.locale,
            },
        });

        userData.locale = interaction.locale;
    }
}

function generalConstraints(
    interaction: CommandInteraction,
    command: ClientCommand,
) {
    const { blockedUsers, devMode } = interaction.client.config;
    const { ownerOnly, requireRegistration, noDM } = command.properties;

    if (blockedUsers.includes(interaction.user.id)) {
        throw new ConstraintError('blockedUsers');
    }

    if (
        devMode === true
        && ownerIDs.includes(interaction.user.id) === false
    ) {
        throw new ConstraintError('devMode');
    }

    if (
        ownerOnly === true
        && ownerIDs.includes(interaction.user.id) === false
    ) {
        throw new ConstraintError('owner');
    }

    if (requireRegistration === true) {
        const data = SQLite.getUser<UserAPIData>({
            discordID: interaction.user.id,
            table: Constants.tables.api,
            allowUndefined: true,
            columns: ['discordID'],
        });

        if (typeof data === 'undefined') {
            throw new ConstraintError('register');
        }
    }

    if (
        noDM === true
        && !interaction.inCachedGuild()
    ) {
        throw new ConstraintError('dm');
    }
}

function cooldownConstraint(
    interaction: CommandInteraction,
    command: ClientCommand,
) {
    const { client: { cooldowns }, user } = interaction;
    const { name, cooldown } = command.properties;

    const timestamps = cooldowns.get(name);

    if (typeof timestamps === 'undefined') {
        cooldowns.set(name, new Collection());
        cooldowns.get(name)!.set(user.id, Date.now());
        return;
    }

    const expireTime = Number(timestamps.get(user.id)) + cooldown;
    const isCooldown = expireTime
        > (Constants.ms.second * 2.5) + Date.now();
    const timeLeft = expireTime - Date.now();

    if (isCooldown === true) {
        throw new ConstraintError('cooldown', timeLeft);
    }

    timestamps.set(user.id, Date.now());
}

async function checkSystemMessages(
    interaction: CommandInteraction,
    userData: UserData,
    locale: string,
) {
    if (userData.systemMessages.length > 0) {
        const text = RegionLocales.locale(locale).errors.systemMessages;

        const systemMessages = new BetterEmbed({ text: text.embed.footer })
            .setColor(Constants.colors.normal)
            .setTitle(text.embed.title)
            .setDescription(text.embed.description);

        // eslint-disable-next-line no-restricted-syntax
        for (const message of userData.systemMessages) {
            systemMessages.addFields({
                name: message.name,
                value: message.value,
            });
        }

        systemMessages.data.fields?.splice(25);

        const promises = await Promise.allSettled([
            interaction.user.send({ embeds: [systemMessages] }),
            interaction.followUp({
                content: interaction.user.toString(),
                embeds: [systemMessages],
            }),
        ]);

        promises.filter((promise) => promise.status === 'rejected')
            .forEach((rejected) => {
                Log.interaction(
                    interaction,
                    'Error while sending system notifications',
                    (rejected as PromiseRejectedResult)?.reason,
                );
            });

        SQLite.updateUser<UserData>({
            discordID: interaction.user.id,
            table: Constants.tables.users,
            data: { systemMessages: [] },
        });
    }
}