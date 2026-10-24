export interface ContainerOptions {
    spacing?: number;
}
export declare class GlassContainer {
    readonly el: HTMLElement;
    readonly options: ContainerOptions;
    constructor(el: HTMLElement, options?: ContainerOptions);
}
export declare const container: (el: HTMLElement, options?: ContainerOptions) => GlassContainer;
