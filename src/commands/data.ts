import { Buffer } from 'node:buffer';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    type Message,
    type MessageComponentInteraction,
} from 'discord.js';
import { type ClientCommand } from '../@types/client';
import {
    type DefenderModule,
    type FriendsModule,
    type RewardsModule,
    type UserAPIData,
    type UserData,
} from '../@types/database';
import { CommandErrorHandler } from '../errors/InteractionErrorHandler';
import { RegionLocales } from '../locales/RegionLocales';
import { Constants } from '../utility/Constants';
import { Log } from '../utility/Log';
import { SQLite } from '../utility/SQLite';
import {
    awaitComponent,
    BetterEmbed,
    capitolToNormal,
    cleanGameMode,
    cleanGameType,
    disableComponents,
    setPresence,
    timestamp,
} from '../utility/utility';

export const properties: ClientCommand['properties'] = {
    name: 'data',
    description: 'View or delete your data stored by this bot.',
    cooldown: 10_000,
    ephemeral: true,
    noDM: false,
    ownerOnly: false,
    requireRegistration: false,
    structure: {
        name: 'data',
        description: 'View or delete your data stored by this bot',
        options: [
            {
                name: 'delete',
                type: 1,
                description: 'Delete your data - there is a confirmation step to prevent accidents',
            },
            {
                name: 'view',
                description: 'View some or all of your player data',
                type: 2,
                options: [
                    {
                        name: 'all',
                        type: 1,
                        description: 'Returns a file with all of your player data',
                    },
                    {
                        name: 'history',
                        type: 1,
                        description:
                            'Returns an interface that shows your player history',
                    },
                ],
            },
        ],
    },
};

export const execute: ClientCommand['execute'] = async (
    interaction,
    locale,
): Promise<void> => {
    const text = RegionLocales.locale(locale).commands.data;
    const { replace } = RegionLocales;

    switch (interaction.options.getSubcommand()) {
        case 'delete':
            await dataDelete();
            break;
        case 'all':
            await viewAll();
            break;
        case 'history':
            await viewHistory();
        // no default
    }

    async function dataDelete() {
        const confirmEmbed = new BetterEmbed(interaction)
            .setColor(Constants.colors.normal)
            .setTitle(text.delete.confirm.title)
            .setDescription(text.delete.confirm.description);

        const yesButton = new ButtonBuilder()
            .setCustomId('true')
            .setLabel(text.delete.yesButton)
            .setStyle(ButtonStyle.Success);

        const noButton = new ButtonBuilder()
            .setCustomId('false')
            .setLabel(text.delete.noButton)
            .setStyle(ButtonStyle.Danger);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            yesButton,
            noButton,
        );

        const message = await interaction.editReply({
            embeds: [confirmEmbed],
            components: [buttonRow],
        }) as Message;

        const disabledRows = disableComponents(
            message.components,
        );

        await interaction.client.channels.fetch(interaction.channelId);

        // eslint-disable-next-line arrow-body-style
        const componentFilter = (i: MessageComponentInteraction) => {
            return interaction.user.id === i.user.id && i.message.id === message.id;
        };

        const button = await awaitComponent(interaction.channel!, {
            componentType: ComponentType.Button,
            filter: componentFilter,
            idle: Constants.ms.second * 30,
        });

        if (button === null) {
            Log.interaction(interaction, 'Ran out of time');

            await interaction.editReply({
                components: disabledRows,
            });
        } else if (button.customId === 'true') {
            SQLite.createTransaction(() => {
                SQLite.deleteUser({
                    discordID: interaction.user.id,
                    allowUndefined: true,
                    table: Constants.tables.users,
                });

                SQLite.deleteUser({
                    discordID: interaction.user.id,
                    allowUndefined: true,
                    table: Constants.tables.api,
                });

                SQLite.deleteUser({
                    discordID: interaction.user.id,
                    allowUndefined: true,
                    table: Constants.tables.defender,
                });

                SQLite.deleteUser({
                    discordID: interaction.user.id,
                    allowUndefined: true,
                    table: Constants.tables.friends,
                });

                SQLite.deleteUser({
                    discordID: interaction.user.id,
                    allowUndefined: true,
                    table: Constants.tables.rewards,
                });
            });

            const deleted = new BetterEmbed(interaction)
                .setColor(Constants.colors.normal)
                .setTitle(text.delete.deleted.title)
                .setDescription(text.delete.deleted.description);

            Log.interaction(interaction, 'Accepted data deletion');

            await button.update({
                embeds: [deleted],
                components: disabledRows,
            });

            setPresence(interaction.client);
        } else {
            const aborted = new BetterEmbed(interaction)
                .setColor(Constants.colors.normal)
                .setTitle(text.delete.aborted.title)
                .setDescription(text.delete.aborted.description);

            Log.interaction(interaction, 'Aborted data deletion');

            await button.update({
                embeds: [aborted],
                components: disabledRows,
            });
        }
    }

    async function viewAll() {
        const userData = SQLite.getUser<UserData>({
            discordID: interaction.user.id,
            table: Constants.tables.users,
            allowUndefined: true,
            columns: ['*'],
        });

        const userAPIData = SQLite.getUser<UserAPIData>({
            discordID: interaction.user.id,
            table: Constants.tables.api,
            allowUndefined: true,
            columns: ['*'],
        });

        const defender = SQLite.getUser<DefenderModule>({
            discordID: interaction.user.id,
            table: Constants.tables.defender,
            allowUndefined: true,
            columns: ['*'],
        });

        const friends = SQLite.getUser<FriendsModule>({
            discordID: interaction.user.id,
            table: Constants.tables.friends,
            allowUndefined: true,
            columns: ['*'],
        });

        const rewards = SQLite.getUser<RewardsModule>({
            discordID: interaction.user.id,
            table: Constants.tables.rewards,
            allowUndefined: true,
            columns: ['*'],
        });

        const allUserData = {
            userData: userData,
            userAPIData: userAPIData,
            defender: defender,
            friends: friends,
            rewards: rewards,
        };

        await interaction.editReply({
            files: [
                {
                    attachment: Buffer.from(
                        JSON.stringify(allUserData, null, 2),
                    ),
                    name: 'userData.json',
                },
            ],
        });
    }

    async function viewHistory() {
        const userAPIData = SQLite.getUser<UserAPIData>({
            discordID: interaction.user.id,
            table: Constants.tables.api,
            columns: ['*'],
            allowUndefined: true,
        }) ?? {
            history: [],
        };

        const base = new ButtonBuilder()
            .setStyle(
                ButtonStyle.Primary,
            ).data;

        const fastLeftButton = new ButtonBuilder(base)
            .setCustomId('fastBackward')
            .setEmoji(Constants.emoji.fastBackward)
            .setDisabled(true);

        const leftButton = new ButtonBuilder(base)
            .setCustomId('backward')
            .setEmoji(Constants.emoji.backward)
            .setDisabled(true);

        const rightButton = new ButtonBuilder(base)
            .setCustomId('forward')
            .setEmoji(Constants.emoji.forward);

        const fastRightButton = new ButtonBuilder(base)
            .setCustomId('fastForward')
            .setEmoji(Constants.emoji.fastForward);

        rightButton.setDisabled(
            userAPIData.history.length <= Constants.defaults.menuFastIncrements,
        );

        fastRightButton.setDisabled(
            userAPIData.history.length <= Constants.defaults.menuIncrements,
        );

        const { keys } = text.history;
        const epoch = /^\d{13,}$/gm;

        const paginator = (position: number): BetterEmbed => {
            const data = userAPIData.history;
            const shownData = data.slice(
                position,
                position + Constants.defaults.menuIncrements,
            );

            // this is great
            const fields = shownData.map(({ date, ...event }) => ({
                name: `${timestamp(date, 'D')} ${timestamp(date, 'T')}`,
                value: Object.entries(event)
                    .map(([key, value]) => `${keys[key as keyof typeof keys]} ${
                        String(value).match(epoch)
                            ? timestamp(value, 'T')
                            : (
                                // eslint-disable-next-line no-nested-ternary
                                key === 'gameType'
                                    ? cleanGameType(value)
                                    : key === 'gameMode'
                                        ? cleanGameMode(value)
                                        : capitolToNormal(value)
                            ) ?? text.history.null
                    }`)
                    .join('\n'),
            }));

            return new BetterEmbed(interaction)
                .setColor(Constants.colors.normal)
                .setTitle(text.history.embed.title)
                .setDescription(replace(text.history.embed.description, {
                    start: position >= userAPIData.history.length
                        ? position
                        : position + 1,
                    end: position + shownData.length,
                    total: userAPIData.history.length,
                    max: Constants.limits.userAPIDataHistory,
                }))
                .setFields(fields);
        };

        const buttons = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(
                fastLeftButton,
                leftButton,
                rightButton,
                fastRightButton,
            );

        const reply = await interaction.editReply({
            embeds: [paginator(0)],
            components: [buttons],
        });

        await interaction.client.channels.fetch(interaction.channelId);

        // eslint-disable-next-line arrow-body-style
        const filter = (i: MessageComponentInteraction) => {
            return interaction.user.id === i.user.id && i.message.id === reply.id;
        };

        const collector = interaction.channel!.createMessageComponentCollector({
            filter: filter,
            idle: Constants.ms.minute * 5,
            time: Constants.ms.minute * 30,
        });

        let currentIndex = 0;

        collector.on('collect', async (i) => {
            try {
                switch (i.customId) {
                    case 'fastBackward':
                        currentIndex -= Constants.defaults.menuFastIncrements;
                        break;
                    case 'backward':
                        currentIndex -= Constants.defaults.menuIncrements;
                        break;
                    case 'forward':
                        currentIndex += Constants.defaults.menuIncrements;
                        break;
                    case 'fastForward':
                        currentIndex += Constants.defaults.menuFastIncrements;
                    // no default
                }

                fastLeftButton.setDisabled(
                    currentIndex - Constants.defaults.menuFastIncrements < 0,
                );

                leftButton.setDisabled(
                    currentIndex - Constants.defaults.menuIncrements < 0,
                );

                rightButton.setDisabled(
                    currentIndex + Constants.defaults.menuIncrements >= userAPIData.history.length,
                );

                fastRightButton.setDisabled(
                    currentIndex + Constants.defaults.menuFastIncrements >= userAPIData.history.length,
                );

                buttons.setComponents(
                    fastLeftButton,
                    leftButton,
                    rightButton,
                    fastRightButton,
                );

                await i.update({
                    embeds: [paginator(currentIndex)],
                    components: [buttons],
                });
            } catch (error) {
                await CommandErrorHandler.init(error, interaction, locale);
            }
        });

        collector.on('end', async () => {
            try {
                const message = (await interaction.fetchReply()) as Message;
                const disabledRows = disableComponents(message.components);

                await interaction.editReply({
                    components: disabledRows,
                });
            } catch (error) {
                await CommandErrorHandler.init(error, interaction, locale);
            }
        });
    }
};