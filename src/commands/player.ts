import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Formatters,
    type Message,
    type MessageComponentInteraction,
} from 'discord.js';
import { type ClientCommand } from '../@types/client';
import {
    type PlayerDB,
    type SlothpixelPlayer,
    type SlothpixelRecentGames,
    type SlothpixelStatus,
} from '../@types/hypixel';
import { HTTPError } from '../errors/HTTPError';
import { CommandErrorHandler } from '../errors/InteractionErrorHandler';
import { RegionLocales } from '../locales/RegionLocales';
import { Constants } from '../utility/Constants';
import { Log } from '../utility/Log';
import { Request } from '../utility/Request';
import {
    BetterEmbed,
    cleanLength,
    disableComponents,
    timestamp,
} from '../utility/utility';

/* eslint-disable @typescript-eslint/naming-convention */

export const properties: ClientCommand['properties'] = {
    name: 'player',
    description: 'View basic data on almost any Hypixel player.',
    cooldown: 10_000,
    ephemeral: true,
    noDM: false,
    ownerOnly: false,
    requireRegistration: false,
    structure: {
        name: 'player',
        description: 'View basic data on almost any Hypixel player',
        options: [
            {
                name: 'status',
                type: 1,
                description: 'Displays general information about the player',
                options: [
                    {
                        name: 'player',
                        type: 3,
                        description: 'The UUID or username to search',
                        required: true,
                    },
                ],
            },
            {
                name: 'recentgames',
                description: 'Displays the player\'s recently played games',
                type: 1,
                options: [
                    {
                        name: 'player',
                        type: 3,
                        description: 'The UUID or username to search',
                        required: true,
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
    const text = RegionLocales.locale(locale).commands.player;
    const { replace } = RegionLocales;
    const { unknown } = text;

    const inputUUID = /^[0-9a-f]{8}(-?)[0-9a-f]{4}(-?)[1-5][0-9a-f]{3}(-?)[89AB][0-9a-f]{3}(-?)[0-9a-f]{12}$/i;
    const inputUsername = /^[a-zA-Z0-9_-]{1,24}$/g;
    const input = interaction.options.getString('player', true);
    const inputType = inputUUID.test(input) === true ? 'UUID' : 'username';

    if (
        inputUUID.test(input) === false
        && inputUsername.test(input) === false
    ) {
        const invalidEmbed = new BetterEmbed(interaction)
            .setColor(Constants.colors.normal)
            .setTitle(text.invalid.title)
            .setDescription(text.invalid.description);

        Log.interaction(interaction, 'Invalid user:', input);

        await interaction.editReply({ embeds: [invalidEmbed] });
        return;
    }

    switch (interaction.options.getSubcommand()) {
        case 'status': await status();
            break;
        case 'recentgames': await recentgames();
            break;
        // no default
    }

    async function status() {
        const responses = await Promise.all([
            fetch(),
            fetch('/status'),
        ]);

        if (
            responses[0].status === 404
            || responses[1].status === 404
        ) {
            await notFound();
            return;
        }

        const {
            uuid,
            username,
            last_login,
            last_logout,
            last_game,
            mc_version,
            language,
            links: {
                TWITTER,
                INSTAGRAM,
                TWITCH,
                DISCORD,
                HYPIXEL,
            },
        } = (await responses[0].json()) as SlothpixelPlayer;

        const {
            online,
            game: {
                type,
                mode,
                map,
            },
        } = (await responses[1].json()) as SlothpixelStatus;

        const statusEmbed = new BetterEmbed(interaction)
            .setColor(Constants.colors.normal)
            .setTitle(text.status.embed.title)
            .setDescription(replace(text.status.embed.description, {
                username: username,
                status: online === true
                    ? text.status.online
                    : text.status.offline,
            }))
            .addFields(
                {
                    name: text.status.embed.field1.name,
                    value: replace(text.status.embed.field1.value, {
                        uuid: uuid,
                        TWITTER: TWITTER ?? unknown,
                        INSTAGRAM: INSTAGRAM ?? unknown,
                        TWITCH: TWITCH ?? unknown,
                        DISCORD: DISCORD ?? unknown,
                        HYPIXEL: HYPIXEL
                            ? Formatters.hyperlink('link', HYPIXEL)
                            : unknown,
                    }),
                },
                {
                    name: text.status.embed.field2.name,
                    value: replace(text.status.embed.field2.value, {
                        lastLogin: timestamp(last_login, 'F') ?? unknown,
                        lastLogout: timestamp(last_logout, 'F') ?? unknown,
                    }),
                },
            );

        if (online === true) {
            statusEmbed
                .addFields({
                    name: text.status.embed.onlineField.name,
                    value: replace(text.status.embed.onlineField.value, {
                        playTime: cleanLength(
                            Date.now() - Number(last_login),
                        ) ?? unknown,
                        gameType: type ?? unknown,
                        gameMode: mode ?? unknown,
                        gameMap: map ?? unknown,
                    }),
                });
        } else {
            statusEmbed
                .addFields({
                    name: text.status.embed.offlineField.name,
                    value: replace(text.status.embed.offlineField.value, {
                        playTime: cleanLength(
                            Number(last_logout) - Number(last_login),
                        ) ?? unknown,
                        gameType: last_game ?? unknown,
                    }),
                });
        }

        statusEmbed
            .addFields({
                name: text.status.embed.field3.name,
                value: replace(text.status.embed.field3.value, {
                    language: language ?? 'ENGLISH',
                    version: mc_version ?? unknown,
                }),
            });

        await interaction.editReply({ embeds: [statusEmbed] });
    }

    async function recentgames() {
        const responses = await Promise.all([
            fetch('/recentGames'),
            new Request().request(`${Constants.urls.playerDB}${input}`),
        ]);

        if (
            responses[0].status === 404
            || responses[1].status === 500
        ) {
            await notFound();
            return;
        }

        const recentGames = (await responses[0].json()) as SlothpixelRecentGames;

        const { username } = ((await responses[1].json()) as PlayerDB).data.player;

        const base = new ButtonBuilder()
            .setStyle(
                ButtonStyle.Primary,
            ).data;

        const paginator = (position: number): BetterEmbed => {
            const shownData = recentGames.slice(
                position,
                position + Constants.defaults.menuIncrements,
            );

            const fields = shownData.map(({
                date, ended, gameType, mode, map,
            }) => ({
                name: replace(text.recentGames.embed.field.name, {
                    gameType: gameType,
                    date: timestamp(date, 'D') ?? unknown,
                }),
                value: replace(text.recentGames.embed.field.value, {
                    start: timestamp(date, 'T') ?? unknown,
                    end: timestamp(ended, 'T') ?? text.recentGames.inProgress,
                    playTime: ended
                        ? `${text.recentGames.playTime}${cleanLength(ended - date)}`
                        : `${text.recentGames.elapsed}${cleanLength(Date.now() - date)}`,
                    mode: mode
                        ? `\n${text.recentGames.gameMode}${mode}`
                        : '',
                    map: map
                        ? `\n${text.recentGames.gameMap}${map}`
                        : '',
                }),
            }));

            return new BetterEmbed(interaction)
                .setColor(Constants.colors.normal)
                .setTitle(replace(text.recentGames.embed.title, {
                    username: username,
                }))
                .setDescription(replace(text.recentGames.embed.description, {
                    start: position >= shownData.length
                        ? position
                        : position + 1,
                    end: position + shownData.length,
                    total: recentGames.length,
                }))
                .setFields(fields);
        };

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

        rightButton.setDisabled(recentGames.length <= Constants.defaults.menuIncrements);

        fastRightButton.setDisabled(recentGames.length <= Constants.defaults.menuFastIncrements);

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
                    currentIndex + Constants.defaults.menuIncrements >= recentGames.length,
                );

                fastRightButton.setDisabled(
                    currentIndex + Constants.defaults.menuFastIncrements >= recentGames.length,
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

    async function fetch(modifier?: string) {
        const url = `${Constants.urls.slothpixel}players/${input}${modifier ?? ''}`;
        const response = await new Request().request(url);

        if (response.status === 404) {
            return response;
        }

        if (response.ok === false) {
            throw new HTTPError({
                message: response.statusText,
                response: response,
                url: url,
            });
        }

        return response;
    }

    async function notFound() {
        const notFoundEmbed = new BetterEmbed(interaction)
            .setColor(Constants.colors.warning)
            .setTitle(text.notFound.title)
            .setDescription(replace(text.notFound.description, {
                inputType: inputType,
            }));

        Log.interaction(interaction, 'User not found', input);

        await interaction.editReply({ embeds: [notFoundEmbed] });
    }
};