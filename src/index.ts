import { validateTwitterConfig, TwitterConfig } from "./environment";
import { TwitterManager } from "./twitter-manager";

const TwitterClientInterface = {
    async start(runtime: any) {
        const twitterConfig: TwitterConfig =
            await validateTwitterConfig(runtime);

        console.log("Twitter client started");

        const manager = new TwitterManager(runtime, twitterConfig);

        // Initialize login/session
        await manager.client.init();

        // Start the posting loop
        await manager.post.start();

        // Start the search logic if it exists
        if (manager.search) {
            await manager.search.start();
        }

        // Start interactions (mentions, replies)
        await manager.interaction.start();

        // If Spaces are enabled, start the periodic check
        if (manager.space) {
            manager.space.startPeriodicSpaceCheck();
        }

        return manager as any;
    },

    async stop(_runtime: any) {
        console.warn("Twitter client does not support stopping yet");
    },
};
export default TwitterClientInterface;
