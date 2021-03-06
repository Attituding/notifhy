import { type CommandInteraction } from 'discord.js';
import {
    type ClientEvent,
    type ClientCommand,
} from '../@types/client';
import { type ClientModule } from '../@types/modules';
import { RegionLocales } from '../locales/RegionLocales';
import { Constants } from '../utility/Constants';
import { Log } from '../utility/Log';
import { BetterEmbed } from '../utility/utility';

export const properties: ClientCommand['properties'] = {
    name: 'reload',
    description: 'Reloads all imports or a single import.',
    cooldown: 0,
    ephemeral: true,
    noDM: false,
    ownerOnly: true,
    requireRegistration: false,
    structure: {
        name: 'reload',
        description: 'Reload',
        options: [
            {
                name: 'all',
                type: 1,
                description: 'Refreshes all imports',
            },
            {
                name: 'single',
                type: 1,
                description: 'Refresh a single command',
                options: [
                    {
                        name: 'type',
                        type: 3,
                        description: 'The category to refresh',
                        required: true,
                        choices: [
                            {
                                name: 'commands',
                                value: 'commands',
                            },
                            {
                                name: 'events',
                                value: 'events',
                            },
                            {
                                name: 'modules',
                                value: 'modules',
                            },
                        ],
                    },
                    {
                        name: 'item',
                        type: 3,
                        description: 'The item to refresh',
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
    const text = RegionLocales.locale(locale).commands.reload;
    const { replace } = RegionLocales;

    switch (interaction.options.getSubcommand()) {
        case 'all': await reloadAll();
            break;
        case 'single': await reloadSingle();
            break;
        // no default
    }

    async function reloadAll() {
        const now = Date.now();
        const promises: Promise<void>[] = [];

        // eslint-disable-next-line no-restricted-syntax
        for (const [command] of interaction.client.commands) {
            promises.push(commandRefresh(interaction, command));
        }

        // eslint-disable-next-line no-restricted-syntax
        for (const [event] of interaction.client.events) {
            promises.push(eventRefresh(interaction, event));
        }

        // eslint-disable-next-line no-restricted-syntax
        for (const [module] of interaction.client.modules) {
            promises.push(moduleRefresh(interaction, module));
        }

        await Promise.all(promises);

        const reloadedEmbed = new BetterEmbed(interaction)
            .setColor(Constants.colors.normal)
            .setTitle(text.all.title)
            .setDescription(replace(text.all.description, {
                imports: promises.length,
                timeTaken: Date.now() - now,
            }));

        Log.interaction(interaction, `All imports have been reloaded after ${
            Date.now() - now
        } milliseconds.`);

        await interaction.editReply({ embeds: [reloadedEmbed] });
    }

    async function reloadSingle() {
        const now = Date.now();
        const typeName = interaction.options.getString('type', true);
        const type = interaction.client[
            typeName as keyof Pick<
                    typeof interaction.client,
            'commands' | 'events' | 'modules'
            >
        ];
        const item = interaction.options.getString('item')!;
        const selected = type.get(item);

        if (typeof selected === 'undefined') {
            const undefinedSelected = new BetterEmbed(interaction)
                .setColor(Constants.colors.warning)
                .setTitle(text.single.unknown.title)
                .setDescription(replace(text.single.unknown.description, {
                    typeName: typeName,
                    item: item,
                }));

            await interaction.editReply({ embeds: [undefinedSelected] });
            return;
        }

        if (typeName === 'commands') {
            commandRefresh(interaction, selected.properties.name);
        } else if (typeName === 'events') {
            eventRefresh(interaction, selected.properties.name);
        } else if (typeName === 'modules') {
            moduleRefresh(interaction, selected.properties.name);
        }

        const reloadedEmbed = new BetterEmbed(interaction)
            .setColor(Constants.colors.normal)
            .setTitle(text.single.success.title)
            .setDescription(replace(text.single.success.description, {
                typeName: typeName,
                item: item,
                timeTaken: Date.now() - now,
            }));

        Log.interaction(interaction, `${typeName}.${item} was successfully reloaded after ${
            Date.now() - now
        } milliseconds.`);

        await interaction.editReply({ embeds: [reloadedEmbed] });
    }
};

async function commandRefresh(interaction: CommandInteraction, item: string) {
    const refreshed = await reload<ClientCommand>(`${item}.js`);
    interaction.client.commands.set(refreshed.properties.name, refreshed);
}

async function eventRefresh(interaction: CommandInteraction, item: string) {
    const refreshed = await reload<ClientEvent>(`../events/${item}.js`);
    interaction.client.events.set(refreshed.properties.name, refreshed);
}

async function moduleRefresh(interaction: CommandInteraction, item: string) {
    const refreshed = await reload<ClientModule>(`../modules/${item}.js`);
    interaction.client.modules.set(refreshed.properties.name, refreshed);
}

function reload<Type>(path: string) {
    return new Promise<Type>((resolve) => {
        delete require.cache[require.resolve(`${__dirname}/${path}`)];
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const refreshed: Type = require(`${__dirname}/${path}`); // eslint-disable-line @typescript-eslint/no-var-requires
        resolve(refreshed);
    });
}