import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { LANGUAGES } from './lang'
import { searchAllIssues, getIssue } from './github-utils/issues'
import type { IssueDetail } from './github-utils/issues'
import { analyzeIssue, type LLMResponse } from './llm'

interface Issue extends IssueDetail {
    has_search?: boolean
}

interface LLMProvider {
    apiUrl: string
    models: string[]
}

const LLMProviders: Record<string, LLMProvider> = {
    DeepSeek: {
        apiUrl: 'https://api.deepseek.com/v1',
        models: ['deepseek-chat', 'deepseek-reasoner']
    },
    OpenAI: {
        apiUrl: 'https://api.openai.com/v1',
        models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    Custom: {
        apiUrl: '',
        models: []
    }
}



const Popup: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'search' | 'settings' | 'analysis'>('search')
    const [githubToken, setGithubToken] = useState('')
    const [language, setLanguage] = useState('zh-CN') // 默认中文
    const [selectedLLM, setSelectedLLM] = useState('DeepSeek')
    const [selectedModel, setSelectedModel] = useState(LLMProviders.DeepSeek.models[0])
    const [llmApiKey, setLlmApiKey] = useState('')
    const [customApiUrl, setCustomApiUrl] = useState('')
    const [customModels, setCustomModels] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [onlySearchClosedIssue, setOnlySearchClosedIssue] = useState(false)
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
        chrome.storage.sync.get(['githubToken', 'language', 'llmConfig', 'searchConfig'], (result: {
            githubToken?: string;
            language?: string;
            llmConfig?: {
                provider: string;
                apiKey: string;
                apiUrl: string;
                model?: string;
            };
            searchConfig?: {
                onlySearchClosedIssue?: boolean;
            };
        }) => {
            if (result.githubToken) setGithubToken(result.githubToken)
            if (result.language) setLanguage(result.language)
            if (result.llmConfig) {
                setSelectedLLM(result.llmConfig.provider)
                setSelectedModel(
                    (result.llmConfig as { provider: string; apiKey: string; apiUrl: string; model?: string }).model ||
                    LLMProviders[result.llmConfig.provider as keyof typeof LLMProviders].models[0]
                )
                setLlmApiKey(result.llmConfig.apiKey)
            }
            if (result.searchConfig?.onlySearchClosedIssue) {
                setOnlySearchClosedIssue(result.searchConfig.onlySearchClosedIssue)
            }
        })
    }, [])

    const handleSave = () => {
        chrome.storage.sync.set({
            githubToken,
            language,
            llmConfig: {
                provider: selectedLLM,
                apiKey: llmApiKey,
                apiUrl: selectedLLM === 'Custom' ? customApiUrl : LLMProviders[selectedLLM as keyof typeof LLMProviders].apiUrl,
                model: selectedLLM === 'Custom' ? customModels.split(',').map(m => m.trim()).filter(m => m)[0] || '' : selectedModel,
                ...(selectedLLM === 'Custom' && {
                    customModels: customModels.split(',').map(m => m.trim()).filter(m => m)
                })
            },
            searchConfig: {
                onlySearchClosedIssue
            }
        }, () => {
            setActiveTab('search')
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
                <h1>GitHub Issue Helper</h1>
                <p>This extension only works on GitHub repository pages</p>
            </div>
        )
    }

    return (
        <div style={{
            width: '320px',
            padding: '16px',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            backgroundColor: '#f6f8fa',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
            {activeTab === 'search' || activeTab === 'analysis' ? (
                <>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: '16px',
                        paddingBottom: '12px',
                        borderBottom: '1px solid #e1e4e8'
                    }}>
                        <h1 style={{
                            margin: 0,
                            fontSize: '18px',
                            fontWeight: 600,
                            color: '#24292e'
                        }}>GitHub Issue Helper</h1>
                    </div>

                    <p style={{
                        margin: '0 0 12px 0',
                        fontSize: '14px',
                        color: '#586069'
                    }}>Current Repository: {repoInfo.owner}/{repoInfo.repo}</p>

                    {activeTab === 'search' && <><div style={{
                        display: 'flex',
                        marginBottom: '12px',
                        gap: '8px'
                    }}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search issues..."
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: '1px solid #e1e4e8',
                                borderRadius: '6px',
                                fontSize: '14px',
                                outline: 'none',
                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.075)'
                            }}
                        />
                        <button
                            onClick={async () => {
                                if (!githubToken) {
                                    alert('Please set your GitHub Token in Settings first');
                                    setActiveTab('settings');
                                    return;
                                }
                                if (!repoInfo.owner || !repoInfo.repo) return;
                                try {
                                    const results = await searchAllIssues(
                                        githubToken,
                                        repoInfo.owner,
                                        repoInfo.repo,
                                        searchQuery,
                                        1000,
                                        onlySearchClosedIssue
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
                            style={{
                                padding: '8px 12px',
                                backgroundColor: '#2ea44f',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 500,
                                fontSize: '14px'
                            }}
                        >
                            🔍 Search
                        </button>
                    </div>

                        {requestDebug && (
                            <div style={{
                                marginBottom: '12px',
                                padding: '12px',
                                backgroundColor: 'white',
                                borderRadius: '6px',
                                fontSize: '13px',
                                border: '1px solid #e1e4e8',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
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
                                                const existingDetails = issues.filter(issue => issue.has_search).length;
                                                processed = existingDetails;
                                                setFetchProgress(Math.round((processed / total) * 100));

                                                for (let i = 0; i < total; i += batchSize) {
                                                    const batch = updatedIssues.slice(i, i + batchSize);
                                                    const promises = batch
                                                        .filter(issue => !issue.has_search)
                                                        .map((issue, index) => {
                                                            const issueId = issue.html_url.split('/').pop()
                                                            return getIssue(githubToken, repoInfo.owner!, repoInfo.repo!, Number(issueId))
                                                                .then(detailedIssue => {
                                                                    updatedIssues[i + index] = {
                                                                        ...issue,
                                                                        ...detailedIssue,
                                                                        has_search: true
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
                            <a
                                onClick={(e) => {
                                    e.preventDefault();
                                    setActiveTab('analysis');
                                }}
                                style={{
                                    marginTop: '10px',
                                    display: 'inline-block',
                                    color: '#0366d6',
                                    textDecoration: 'none',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                {'>'} Analyze these results
                            </a>
                        )}</>}

                    {activeTab === 'analysis' && (
                        <>
                            <a
                                onClick={(e) => {
                                    e.preventDefault();
                                    setActiveTab('search');
                                }}
                                style={{
                                    marginBottom: '12px',
                                    display: 'inline-block',
                                    color: '#0366d6',
                                    textDecoration: 'none',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                {'<'} Return to search
                            </a>

                            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={analysisQuestion}
                                    onChange={(e) => setAnalysisQuestion(e.target.value)}
                                    placeholder="What would you like to analyze?"
                                    style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        border: '1px solid #e1e4e8',
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        outline: 'none'
                                    }}
                                />
                                <button
                                    onClick={async () => {
                                        if (!Array.isArray(requestDebug?.data)) return;
                                        if (!llmApiKey) {
                                            alert('Please set your LLM API Key in Settings first');
                                            setActiveTab('settings');
                                            return;
                                        }
                                        setIsAnalyzing(true);
                                        try {
                                            let fullContent = '';
                                            setAnalysisResult({
                                                content: '',
                                                tokensUsed: 0
                                            });

                                            await analyzeIssue(
                                                analysisQuestion,
                                                JSON.stringify(requestDebug.data || {}),
                                                (chunk) => {
                                                    fullContent += chunk;
                                                    setAnalysisResult({
                                                        content: fullContent,
                                                        tokensUsed: 0
                                                    });
                                                }
                                            );
                                        } finally {
                                            setIsAnalyzing(false);
                                        }
                                    }}
                                    disabled={isAnalyzing}
                                    style={{
                                        marginLeft: '10px',
                                        padding: '8px 12px',
                                        backgroundColor: isAnalyzing ? '#8b949e' : '#2ea44f',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        fontSize: '14px',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                                </button>
                            </div>
                        </>
                    )}

                    {activeTab === 'analysis' && analysisResult && (
                        <div style={{
                            marginBottom: '12px',
                            padding: '16px',
                            backgroundColor: 'white',
                            borderRadius: '8px',
                            border: '1px solid #e1e4e8',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                marginBottom: '12px',
                                paddingBottom: '8px',
                                borderBottom: '1px solid #eaecef'
                            }}>
                                <h4 style={{
                                    margin: 0,
                                    fontSize: '15px',
                                    fontWeight: 600,
                                    color: '#24292e'
                                }}>Analysis Result</h4>
                            </div>
                            <div
                                ref={(el) => {
                                    if (el) {
                                        el.scrollTop = el.scrollHeight;
                                    }
                                }}
                                style={{
                                    height: '200px',
                                    overflowY: 'auto',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    backgroundColor: '#f6f8fa',
                                    border: '1px solid #e1e4e8'
                                }}
                            >
                                <ReactMarkdown>
                                    {analysisResult.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => setActiveTab('settings')}
                        style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            backgroundColor: 'transparent',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        ⚙️ Settings
                    </button>
                </>
            ) : (
                <>
                    <h2>Settings</h2>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>
                            Language:
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                style={{ width: '100%', padding: '8px', marginTop: '4px' }}
                            >
                                {LANGUAGES.map(lang => (
                                    <option key={lang.value} value={lang.value}>
                                        {lang.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

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

                    {selectedLLM !== 'Custom' && (
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
                    )}

                    {selectedLLM === 'Custom' && (
                        <>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px' }}>
                                    Custom API URL:
                                    <input
                                        type="text"
                                        value={customApiUrl}
                                        onChange={(e) => setCustomApiUrl(e.target.value)}
                                        style={{ width: '100%', padding: '8px' }}
                                        placeholder="https://api.example.com/v1"
                                    />
                                </label>
                            </div>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px' }}>
                                    Custom Models (comma separated):
                                    <input
                                        type="text"
                                        value={customModels}
                                        onChange={(e) => setCustomModels(e.target.value)}
                                        style={{ width: '100%', padding: '8px' }}
                                        placeholder="model1,model2,model3"
                                    />
                                </label>
                            </div>
                        </>
                    )}

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

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="checkbox"
                                checked={onlySearchClosedIssue}
                                onChange={(e) => setOnlySearchClosedIssue(e.target.checked)}
                            />
                            Only search closed issues
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