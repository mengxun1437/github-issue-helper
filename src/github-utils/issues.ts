import { Octokit } from '@octokit/core';

export interface Comment {
  author_association: string;
  reactions?: {
    '+1': number;
    '-1': number;
    laugh: number;
    confused: number;
    heart: number;
    hooray: number;
    eyes: number;
    rocket: number;
  };
  body: string;
}

export interface IssueDetail extends Issue {
  labels?: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  closed_at?: string;
  author_association?: string;
  userComments?: Comment[];
}

export interface Issue {
  title: string;
  state: 'open' | 'closed';
  body?: string;
  html_url: string;
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
  const allIssues = allPages.flat().map((i) => ({
    title: i.title,
    state: i.state,
    body: i.body,
    html_url: i.html_url
  }));

  return allIssues;
}

export async function getIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<IssueDetail> {
  const octokit = new Octokit({ auth: token });

  // 获取issue详情
  const issueResponse = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
    owner,
    repo,
    issue_number: issueNumber
  });

  // 获取评论
  const commentsResponse = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
    owner,
    repo,
    issue_number: issueNumber
  });

  interface Label {
    id: number;
    name: string;
    color: string;
  }

  const issue = {
    title: issueResponse.data.title,
    state: issueResponse.data.state as 'open' | 'closed',
    body: issueResponse.data.body || undefined,
    html_url: issueResponse.data.html_url,
    labels: (issueResponse.data.labels as Array<Label | string>).map((label) => {
      if (typeof label === 'string') {
        return {
          id: 0,
          name: label,
          color: ''
        };
      }
      return {
        id: label.id,
        name: label.name,
        color: label.color
      };
    }),
    assignee: issueResponse.data.assignee
      ? {
          login: issueResponse.data.assignee.login,
          id: issueResponse.data.assignee.id,
          avatar_url: issueResponse.data.assignee.avatar_url
        }
      : undefined,
    closed_at: issueResponse.data.closed_at,
    author_association: issueResponse.data.author_association
  } as IssueDetail;

  issue.userComments = commentsResponse.data.map((comment) => ({
    author_association: comment.author_association,
    reactions: comment.reactions,
    body: comment.body || ''
  }));

  return issue;
}
