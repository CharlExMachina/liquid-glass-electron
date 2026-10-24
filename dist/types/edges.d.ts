export interface ScrollEdgeOptions {
    /** which edges (top) */
    edges?: ('top' | 'bottom')[];
    /** soft: blur dissolving into the content; hard: a nearly opaque band and a line */
    style?: 'soft' | 'hard';
    /** how far the effect reaches into the content, px (56; the toolbar's height is a good value) */
    size?: number;
    /** blur at the very edge, px (10) */
    blur?: number;
    /** dark content: dim rather than lighten (default: follows the page's colour scheme) */
    dark?: boolean;
}
/** Add the scroll edge effect to a scrolling element. Returns a function that takes it off. */
export declare function scrollEdge(scroller: HTMLElement, options?: ScrollEdgeOptions): () => void;
