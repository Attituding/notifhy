import type {
    CommandExecute,
    CommandProperties,
} from '../@types/client';
import { BetterEmbed } from '../util/utility';
import { CommandInteraction } from 'discord.js';
import Constants from '../util/Constants';

export const properties: CommandProperties = {
    name: 'performance',
    description: 'View system performance',
    usage: '/system',
    cooldown: 0,
    ephemeral: true,
    noDM: false,
    ownerOnly: true,
    structure: {
        name: 'performance',
        description: 'View system performance',
    },
};

export const execute: CommandExecute = async (
    interaction: CommandInteraction,
): Promise<void> => {
    const { instance } = interaction.client.hypixelAPI;

    const {
        fetch: fetchPerformance,
        databaseFetch: databaseFetchPerformance,
        process: processPerformance,
        save: savePerformance,
        modules: modulePerformance,
    } = instance.performance.latest!;

    const responseEmbed = new BetterEmbed(interaction)
        .setColor(Constants.colors.normal)
        .setTitle('Performance')
        .addFields([
            {
                name: 'Latest Performance',
                value:
                `Hypixel API Fetch: ${
                    fetchPerformance
                }ms
                Database Fetch: ${
                    databaseFetchPerformance
                }ms
                Process Data: ${
                    processPerformance
                }ms
                Save Data: ${
                    savePerformance
                }ms
                Module Execution: ${
                    modulePerformance
                }ms
                Total: ${
                    fetchPerformance +
                    processPerformance +
                    savePerformance +
                    modulePerformance
                }ms`,
            },
        ]);

    await interaction.editReply({
        embeds: [responseEmbed],
    });
};