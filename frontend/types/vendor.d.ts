// Minimal hand-written types for the vendored libraries in frontend/vendor/.
// Real @types packages need npm, which isn't available on every machine, so these
// cover just what this project uses. Extend them when you use more of an API.

declare module 'zustand' {
    type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
    type GetState<T> = () => T;
    /** The function passed to create(): builds the initial state and actions. */
    type StateCreator<T> = (set: SetState<T>, get: GetState<T>) => T;

    interface UseBoundStore<T> {
        /** Subscribe to a slice; the component re-renders only when the slice changes. */
        <U>(selector: (state: T) => U): U;
        /** Subscribe to the whole store (re-renders on every change; prefer a selector). */
        (): T;
        getState(): T;
        setState: SetState<T>;
        subscribe(listener: (state: T, prev: T) => void): () => void;
    }

    export function create<T>(initializer: StateCreator<T>): UseBoundStore<T>;
}

declare module 'htm' {
    const htm: {
        bind<R>(h: (type: any, props: any, ...children: any[]) => R): (strings: TemplateStringsArray, ...values: any[]) => R;
    };
    export default htm;
}

declare module 'react' {
    type Ref<T> = { current: T };

    export function useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void];
    export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
    export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
    export function useRef<T>(initial: T): Ref<T>;
    export function memo<P>(component: (props: P) => any): (props: P) => any;
    export function createElement(type: any, props?: any, ...children: any[]): any;

    const React: { createElement: typeof createElement };
    export default React;
}

declare module 'react-dom/client' {
    export function createRoot(container: Element | null): { render(element: any): void; unmount(): void };
}
