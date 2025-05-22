import { Octokit } from '@octokit/core';

export interface IssueDetail {
  id: number;
  title: string;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  body?: string;
  html_url: string;
  number: number;
  user: {
    login: string;
    id: number;
    avatar_url: string;
  };
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  assignee?: {
    login: string;
    id: number;
    avatar_url: string;
  };
  comments: number;
  closed_at?: string;
  author_association: string;
}

export interface Issue {
  id: number;
  title: string;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  body?: string;
  html_url: string;
  issueDetail?: IssueDetail; // 可选字段，使用更具体的类型
}

export async function searchIssues(
  token: string,
  owner: string,
  repo: string,
  query?: string,
  page = 1,
  perPage = 100,
  onlyClosed = false
): Promise<Issue[]> {
  const octokit = new Octokit({ auth: token });
  const searchQuery = [
    `repo:${owner}/${repo}`,
    'type:issue',
    ...(onlyClosed ? ['state:closed'] : []),
    ...(query ? [query] : [])
  ].join(' ');

  const response = await octokit.request('GET /search/issues', {
    q: searchQuery,
    per_page: perPage,
    page,
    sort: 'created',
    order: 'desc'
  });

  return response.data.items.map((issue) => ({
    id: issue.id,
    title: issue.title,
    state: issue.state as 'open' | 'closed',
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    body: issue.body || undefined,
    html_url: issue.html_url
  }));
}

export async function searchAllIssues(
  token: string,
  owner: string,
  repo: string,
  query?: string,
  maxResults = 1000,
  onlyClosed = false
): Promise<Issue[]> {
  const perPage = 100;
  const totalPages = Math.ceil(maxResults / perPage);

  // Prepare all page requests
  const pageRequests = [];
  for (let page = 1; page <= totalPages; page++) {
    pageRequests.push(searchIssues(token, owner, repo, query, page, perPage, onlyClosed));
  }

  // Execute all requests in parallel
  const allPages = await Promise.all(pageRequests);

  // Combine and flatten all results
  const allIssues = allPages.flat();

  return allIssues;
}

export async function getIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<IssueDetail> {
  const octokit = new Octokit({ auth: token });

  const response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
    owner,
    repo,
    issue_number: issueNumber
  });

  return response.data as IssueDetail;
}
