const axios = require('axios')
const axiosRetry = require('axios-retry')
const graphqlUrl = 'https://api.github.com/graphql'
 
axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay
})

// recursive function to fetch all events where the issue was closed
const getIssueClosedEvents = (accessToken, issueId, after = null, result = { closedEvents: [], body: '' }) => {
    return axios.post(graphqlUrl, {
        query: `query {
            rateLimit {
            limit
            cost
            remaining
            resetAt
            }
            node(id:"${issueId}") {
            ... on Issue {
                body
                timelineItems(itemTypes: [CLOSED_EVENT], first: 1${after ? ', after: "' + after + '"' : ''}) {
                pageInfo {
                    hasNextPage
                    endCursor
                }
                nodes {
                    ... on ClosedEvent {
                    closer {
                        ... on PullRequest {
                        author {
                            login
                        }
                        }
                    }
                    }
                }
                }
            }
            }
        }`
    }, {
        headers: {
            Authorization: 'bearer ' + accessToken
        }
    }).then(res => {
        result.body = res.data.data.node.body
        result.closedEvents.push(...res.data.data.node.timelineItems.nodes)
        if (res.data.data.node.timelineItems.pageInfo.hasNextPage) {
            return getIssueClosedEvents(accessToken, issueId, res.data.data.node.timelineItems.pageInfo.endCursor, result)
        } else {
            return result
        }
    }).catch(e => {
        throw e
    })
  }

module.exports = (githubUser, issueId, accessToken = '') => {
    if (!accessToken) {
        if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
            throw Error('OctoBay Adapters: No GitHub access token set. (GITHUB_PERSONAL_ACCESS_TOKEN) ')
        } else {
            accessToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN
        }
    }

    return getIssueClosedEvents(accessToken, issueId).then(result => {
        let releasedByPullRequest = false
        result.closedEvents.forEach(closedEvent => {
          if (closedEvent.closer && closedEvent.closer.author.login === githubUser) {
            releasedByPullRequest = true
          }
        })
    
        const releaseCommandRegex = new RegExp(`^(\\s+)?@OctoBay([ ]+)release([ ]+)to([ ]+)@${githubUser}(\\s+)?$`, 'igm')
        const releasedByCommand = !!result.body.match(releaseCommandRegex)
    
        return { releasedByCommand, releasedByPullRequest }
    }).catch(e => {
        throw e
    })
}