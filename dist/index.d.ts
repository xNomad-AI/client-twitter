declare const TwitterClientInterface: {
    start(runtime: any): Promise<any>;
    stop(_runtime: any): Promise<void>;
};

export { TwitterClientInterface as default };
