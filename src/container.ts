export interface ContainerOptions {
  spacing?: number;
}
export class GlassContainer {
  constructor(readonly el: HTMLElement, readonly options: ContainerOptions = {}) {}
}
export const container = (el: HTMLElement, options: ContainerOptions = {}) => new GlassContainer(el, options);
