import React, { useState, useEffect } from 'react'
import { searchAllIssues, getIssue } from './github-utils/issues'
import type { Issue } from './github-utils/issues'
import { analyzeIssue, type LLMResponse } from './llm'

const LLMProviders = {
    DeepSeek: {
        apiUrl: 'https://api.deepseek.com/v1',
        models: ['deepseek-chat', 'deepseek-reasoner']
    },
    OpenAI: {
        apiUrl: 'https://api.openai.com/v1',
        models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo']
    }
}



const Popup: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'main' | 'settings'>('main')
    const [githubToken, setGithubToken] = useState('')
    const [selectedLLM, setSelectedLLM] = useState('DeepSeek')
    const [selectedModel, setSelectedModel] = useState(LLMProviders.DeepSeek.models[0])
    const [llmApiKey, setLlmApiKey] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [analysisQuestion, setAnalysisQuestion] = useState('')
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analysisResult, setAnalysisResult] = useState<LLMResponse | null>(null)
    const [requestDebug, setRequestDebug] = useState<{
        url: string
        status: number
        data: Issue[] | string
    } | null>(null)
    const [isFetchingDetails, setIsFetchingDetails] = useState(false)
    const [fetchProgress, setFetchProgress] = useState(0)

    useEffect(() => {
        chrome.storage.sync.get(['githubToken', 'llmConfig'], (result) => {
            if (result.githubToken) setGithubToken(result.githubToken)
            if (result.llmConfig) {
                setSelectedLLM(result.llmConfig.provider)
                setSelectedModel(
                    (result.llmConfig as { provider: string; apiKey: string; apiUrl: string; model?: string }).model ||
                    LLMProviders[result.llmConfig.provider as keyof typeof LLMProviders].models[0]
                )
                setLlmApiKey(result.llmConfig.apiKey)
            }
        })
    }, [])

    const handleSave = () => {
        chrome.storage.sync.set({
            githubToken,
            llmConfig: {
                provider: selectedLLM,
                apiKey: llmApiKey,
                apiUrl: LLMProviders[selectedLLM as keyof typeof LLMProviders].apiUrl,
                model: selectedModel
            }
        }, () => {
            setActiveTab('main')
        })
    }

    const [repoInfo, setRepoInfo] = useState<{ valid: boolean, owner?: string, repo?: string }>({ valid: false })

    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url
            if (url?.includes('github.com')) {
                const match = url.match(/github\.com\/([^/]+)\/([^/]+)/)
                if (match && match.length >= 3) {
                    setRepoInfo({
                        valid: true,
                        owner: match[1],
                        repo: match[2]
                    })
                    // Save repo info to storage
                    chrome.storage.sync.set({ currentRepo: `${match[1]}/${match[2]}` })
                    return
                }
            }
            setRepoInfo({ valid: false })
        })
    }, [])

    if (!repoInfo.valid) {
        return (
            <div style={{ width: '300px', padding: '16px' }}>
                <h1>GitHub Helper</h1>
                <p>This extension only works on GitHub repository pages</p>
            </div>
        )
    }

    return (
        <div style={{ width: '300px', padding: '16px' }}>
            {activeTab === 'main' ? (
                <>
                    <h1>GitHub Helper</h1>
                    <p>Current Repository: {repoInfo.owner}/{repoInfo.repo}</p>

                    <div style={{ display: 'flex', margin: '10px 0' }}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search issues..."
                            style={{ flex: 1, padding: '8px' }}
                        />
                        <button
                            onClick={async () => {
                                if (!githubToken || !repoInfo.owner || !repoInfo.repo) return
                                try {
                                    const results = await searchAllIssues(
                                        githubToken,
                                        repoInfo.owner,
                                        repoInfo.repo,
                                        searchQuery
                                    );
                                    console.log('Fetched issues count:', results.length);
                                    setRequestDebug({
                                        url: `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues`,
                                        status: 200,
                                        data: results
                                    })
                                } catch (error) {
                                    setRequestDebug({
                                        url: `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/issues`,
                                        status: (error as { status?: number }).status || 500,
                                        data: (error as { message: string }).message
                                    })
                                }
                            }}
                            style={{ padding: '8px', marginLeft: '5px' }}
                        >
                            🔍
                        </button>
                    </div>

                    {requestDebug && (
                        <div style={{
                            marginTop: '10px',
                            padding: '10px',
                            backgroundColor: '#f6f8fa',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }}>
                            <div><strong>Request URL:</strong> {requestDebug.url}</div>
                            <div><strong>Status:</strong> {requestDebug.status}</div>
                            <div>
                                <strong>Results:</strong> {Array.isArray(requestDebug.data) ? requestDebug.data.length : 1} items
                                <button
                                    onClick={async () => {
                                        if (!Array.isArray(requestDebug?.data) || isFetchingDetails) return;
                                        setIsFetchingDetails(true);
                                        try {
                                            const issues = requestDebug.data as Issue[];
                                            const total = issues.length;
                                            let processed = 0;
                                            const batchSize = 10;
                                            const delay = 2000; // 2s delay between batches

                                            const updatedIssues = [...issues];
                                            // 先计算已有详情的数量
                                            const existingDetails = issues.filter(issue => issue.issueDetail).length;
                                            processed = existingDetails;
                                            setFetchProgress(Math.round((processed / total) * 100));

                                            for (let i = 0; i < total; i += batchSize) {
                                                const batch = updatedIssues.slice(i, i + batchSize);
                                                const promises = batch
                                                    .filter(issue => !issue.issueDetail)
                                                    .map((issue, index) => {
                                                        const issueId = issue.html_url.split('/').pop()
                                                        return getIssue(githubToken, repoInfo.owner!, repoInfo.repo!, Number(issueId))
                                                            .then(detailedIssue => {
                                                                updatedIssues[i + index] = {
                                                                    ...issue,
                                                                    issueDetail: detailedIssue
                                                                };
                                                                processed++;
                                                                setFetchProgress(Math.round((processed / total) * 100));
                                                            })
                                                    }

                                                    );

                                                if (promises.length === 0) continue;
                                                await Promise.all(promises);
                                                if (i + batchSize < total) {
                                                    await new Promise(resolve => setTimeout(resolve, delay));
                                                }
                                            }

                                            setRequestDebug(prev => ({
                                                ...prev!,
                                                data: updatedIssues
                                            }));
                                        } finally {
                                            setIsFetchingDetails(false);
                                            setFetchProgress(0);
                                        }
                                    }}
                                    disabled={isFetchingDetails}
                                    style={{
                                        marginLeft: '10px',
                                        padding: '2px 6px',
                                        fontSize: '10px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {isFetchingDetails ? 'Fetching...' : 'Get Details'}
                                </button>
                            </div>
                            <details style={{ marginTop: '5px' }}>
                                <summary style={{ cursor: 'pointer' }}>View Details</summary>
                                <div style={{ marginTop: '5px' }}>
                                    <button
                                        onClick={() => {
                                            const text = JSON.stringify(requestDebug.data, null, 2);
                                            const blob = new Blob([text], { type: 'application/json' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = 'issues-data.json';
                                            a.click();
                                            URL.revokeObjectURL(url);
                                        }}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '12px',
                                            marginBottom: '5px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Download Full Data
                                    </button>
                                    <pre style={{
                                        maxHeight: '200px',
                                        overflow: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordWrap: 'break-word',
                                        backgroundColor: '#f8f8f8',
                                        padding: '8px',
                                        borderRadius: '4px'
                                    }}>
                                        {JSON.stringify(
                                            Array.isArray(requestDebug.data)
                                                ? requestDebug.data.slice(0, 2)
                                                : requestDebug.data,
                                            null,
                                            2
                                        )}
                                        {Array.isArray(requestDebug.data) && requestDebug.data.length > 10 && (
                                            <div style={{ color: '#666', fontStyle: 'italic' }}>
                                                (Showing first 10 items, {requestDebug.data.length - 10} more...)
                                            </div>
                                        )}
                                    </pre>
                                </div>
                            </details>
                        </div>)}

                    {isFetchingDetails && (
                        <div style={{ marginTop: '10px' }}>
                            <div style={{
                                width: '100%',
                                backgroundColor: '#e0e0e0',
                                borderRadius: '4px'
                            }}>
                                <div style={{
                                    width: `${fetchProgress}%`,
                                    height: '20px',
                                    backgroundColor: '#0366d6',
                                    borderRadius: '4px',
                                    textAlign: 'center',
                                    color: 'white',
                                    lineHeight: '20px',
                                    fontSize: '12px'
                                }}>
                                    {fetchProgress}%
                                </div>
                            </div>
                        </div>
                    )}

                    {requestDebug && Array.isArray(requestDebug.data) && (
                        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center' }}>
                            <input
                                type="text"
                                value={analysisQuestion}
                                onChange={(e) => setAnalysisQuestion(e.target.value)}
                                placeholder="What would you like to analyze?"
                                style={{ flex: 1, padding: '8px' }}
                            />
                            <button
                                onClick={async () => {
                                    if (!Array.isArray(requestDebug?.data)) return;
                                    setIsAnalyzing(true);
                                    try {
                                        const result = await analyzeIssue(
                                            analysisQuestion,
                                            JSON.stringify(requestDebug.data || {})
                                        );
                                        setAnalysisResult(result);
                                    } finally {
                                        setIsAnalyzing(false);
                                    }
                                }}
                                disabled={isAnalyzing}
                                style={{
                                    marginLeft: '10px',
                                    padding: '8px',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                }}
                            >
                                {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                            </button>
                        </div>
                    )}

                    {requestDebug && analysisResult && (
                        <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f0f8ff', borderRadius: '4px' }}>
                            <h4>Analysis Result:</h4>
                            <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                                {analysisResult.content}
                            </pre>
                        </div>
                    )}

                    <button
                        onClick={() => setActiveTab('settings')}
                        style={{ padding: '8px', marginTop: '10px' }}
                    >
                        Open Settings
                    </button>
                </>
            ) : (
                <>
                    <h2>Settings</h2>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>
                            GitHub Token:
                            <input
                                type="password"
                                value={githubToken}
                                onChange={(e) => setGithubToken(e.target.value)}
                                style={{ width: '100%', padding: '8px' }}
                            />
                        </label>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>
                            LLM Provider:
                            <select
                                value={selectedLLM}
                                onChange={(e) => {
                                    setSelectedLLM(e.target.value)
                                    setSelectedModel(LLMProviders[e.target.value as keyof typeof LLMProviders].models[0])
                                }}
                                style={{ width: '100%', padding: '8px' }}
                            >
                                {Object.keys(LLMProviders).map(provider => (
                                    <option key={provider} value={provider}>
                                        {provider}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>
                            Model:
                            <select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                style={{ width: '100%', padding: '8px' }}
                            >
                                {LLMProviders[selectedLLM as keyof typeof LLMProviders].models.map(model => (
                                    <option key={model} value={model}>
                                        {model}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>
                            LLM API Key:
                            <input
                                type="password"
                                value={llmApiKey}
                                onChange={(e) => setLlmApiKey(e.target.value)}
                                style={{ width: '100%', padding: '8px' }}
                            />
                        </label>
                    </div>

                    <button
                        onClick={handleSave}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: '#0366d6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Save Settings
                    </button>
                </>
            )
            }
        </div >
    )
}

export default Popup