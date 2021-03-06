import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    type MessageComponentInteraction,
} from 'discord.js';
import { type ClientCommand } from '../@types/client';
import { type UserData } from '../@types/database';
import { RegionLocales } from '../locales/RegionLocales';
import { Constants } from '../utility/Constants';
import { Log } from '../utility/Log';
import { SQLite } from '../utility/SQLite';
import {
    awaitComponent,
    BetterEmbed,
    disableComponents,
    timestamp,
} from '../utility/utility';

export const properties: ClientCommand['properties'] = {
    name: 'systemmessage',
    description: 'Adds a message to a user\'s system messages.',
    cooldown: 0,
    ephemeral: true,
    noDM: false,
    ownerOnly: true,
    requireRegistration: false,
    structure: {
        name: 'systemmessage',
        description: 'Message a user',
        options: [
            {
                name: 'id',
                type: 3,
                description: 'The user to message',
                required: true,
            },
            {
                name: 'name',
                type: 3,
                description: 'Title of the message',
                required: true,
            },
            {
                name: 'value',
                type: 3,
                description: 'Main content of the message',
                required: true,
            },
        ],
    },
};

export const execute: ClientCommand['execute'] = async (
    interaction,
    locale,
): Promise<void> => {
    const text = RegionLocales.locale(locale).commands.systemmessage;
    const { replace } = RegionLocales;

    const id = interaction.options.getString('id', true);

    const userData = SQLite.getUser<UserData>({
        discordID: id,
        table: Constants.tables.users,
        columns: ['systemMessages'],
        allowUndefined: true,
    });

    if (typeof userData === 'undefined') {
        const notFoundEmbed = new BetterEmbed(interaction)
            .setColor(Constants.colors.normal)
            .setTitle(text.notFound.title)
            .setDescription(replace(text.notFound.description, {
                id: id,
            }));

        await interaction.editReply({
            embeds: [notFoundEmbed],
        });

        return;
    }

    let name = interaction.options.getString('name', true);
    const value = interaction.options.getString('value', true);

    name = `${timestamp(Date.now(), 'D')} - ${name}`;

    const buttons = new ActionRowBuilder<ButtonBuilder>()
        .setComponents(
            new ButtonBuilder()
                .setCustomId('true')
                .setLabel(text.preview.buttonLabel)
                .setStyle(ButtonStyle.Primary),
        );

    const validateEmbed = new BetterEmbed(interaction)
        .setColor(Constants.colors.normal)
        .setTitle(text.preview.title)
        .setDescription(text.preview.description)
        .addFields(
            {
                name: 'ID',
                value: id,
            },
            {
                name: name,
                value: value,
            },
        );

    const message = await interaction.editReply({
        embeds: [validateEmbed],
        components: [buttons],
    });

    await interaction.client.channels.fetch(interaction.channelId);

    const componentFilter = (i: MessageComponentInteraction) => interaction.user.id === i.user.id
        && i.message.id === message.id;

    const disabledRows = disableComponents(message.components);

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

        return;
    }

    SQLite.updateUser<UserData>({
        discordID: id,
        table: Constants.tables.users,
        data: {
            systemMessages: [
                {
                    name: name,
                    value: value,
                },
                ...userData.systemMessages,
            ],
        },
    });

    const successEmbed = new EmbedBuilder(validateEmbed.data)
        .setTitle(text.success.title)
        .setDescription(text.success.description);

    Log.interaction(interaction, name);

    await button.update({
        embeds: [successEmbed],
        components: disabledRows,
    });
};