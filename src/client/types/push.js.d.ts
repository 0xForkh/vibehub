declare module 'push.js' {
  interface PushOptions {
    body?: string;
    icon?: string;
    tag?: string;
    requireInteraction?: boolean;
    timeout?: number;
    onClick?: () => void;
    onClose?: () => void;
    onError?: () => void;
    onShow?: () => void;
  }

  interface Push {
    create(title: string, options?: PushOptions): Promise<Notification>;
    close(tag: string): void;
    Permission: {
      has(): boolean;
      request(onGranted?: () => void, onDenied?: () => void): void;
    };
  }

  const push: Push;
  export default push;
}
