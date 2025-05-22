declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(
        keys: string | string[] | null,
        callback: (items: {
          githubToken?: string;
          llmConfig?: {
            provider: string;
            apiKey: string;
            apiUrl: string;
          };
        }) => void
      ): void;
      set(
        items: {
          githubToken?: string;
          llmConfig?: {
            provider: string;
            apiKey: string;
            apiUrl: string;
            model: string;
          };
          currentRepo?: string;
          openaiKey?: string;
        },
        callback?: () => void
      ): void;
    }

    const sync: StorageArea;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
    }

    function query(
      queryInfo: {
        active?: boolean;
        currentWindow?: boolean;
      },
      callback: (tabs: Tab[]) => void
    ): void;
  }
}
