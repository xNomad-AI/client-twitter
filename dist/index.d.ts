declare const TwitterClientInterface: {
    name: string;
    config: {};
    start(runtime: any): Promise<any>;
    stop(_runtime: any): Promise<void>;
};

export { TwitterClientInterface as default };
