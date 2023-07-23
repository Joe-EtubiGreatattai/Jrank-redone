document.addEventListener("DOMContentLoaded", function () {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];

    chrome.history.search(
      {
        text: "",
        maxResults: 1,
        startTime: 0,
        endTime: Date.now(),
        text: "scholar.google.com",
      },
      function (historyItems) {
        if (historyItems.length > 0) {
          var lastSearchQuery = extractSearchQuery(historyItems[0].url);
          // Define the variable to hold the fetched results
          var fetchedResults = [];

          // Call the function to fetch Google Scholar results
          fetchGoogleScholarResults(tab, lastSearchQuery, function (results) {
            console.log("Google Scholar Results:", results);

            // Assign the fetched results to the variable
            fetchedResults = results;

            // Continue with the remaining code to format browser history and calculate similarity
            chrome.history.search(
              { text: "", maxResults: 1000, startTime: 0, endTime: Date.now() },
              function (historyItems) {
                if (historyItems.length > 0) {
                  // Format the browser history
                  formatBrowserHistory(historyItems, function (formattedHistory) {
                    console.log("Browser History:", formattedHistory);

                    // Apply the RankMaster algorithm to the results
                    var rankedResults = applyRankMasterAlgorithm(
                      fetchedResults,
                      formattedHistory
                    );
                    console.log("Ranked Results:", rankedResults);

                    displayRankedResults(rankedResults);

                    // Calculate and display the similarity
                    var similarity = calculateSimilarity(
                      fetchedResults,
                      rankedResults
                    );
                    console.log("Similarity:", similarity);
                  });
                } else {
                  console.log("No browser history data available.");
                }
              }
            );
          });
        } else {
          console.log("No browser history data available.");
        }
      }
    );
  });
});

function fetchGoogleScholarResults(tab, query, callback) {
  var url =
    "https://scholar.google.com/scholar?q=" + query + "&hl=en&as_sdt=0,5";
  document.getElementById("qeryHolder").innerText = query;
  chrome.tabs.update(tab.id, { url: url }, function () {
    chrome.tabs.onUpdated.addListener(function listener(
      tabId,
      changeInfo,
      tab
    ) {
      if (
        tabId === tab.id &&
        changeInfo.status === "complete" &&
        tab.url.startsWith("https://scholar.google.com")
      ) {
        chrome.tabs.onUpdated.removeListener(listener);

        chrome.tabs.executeScript(
          tab.id,
          { file: "contentScript.js" },
          function (results) {
            callback(results[0]);
          }
        );
      }
    });
  });
}

function formatBrowserHistory(historyItems, callback) {
  var formattedHistory = [];

  function processHistoryItem(index) {
    if (index >= historyItems.length) {
      callback(formattedHistory);
      return;
    }

    var item = historyItems[index];
    var formattedItem = {
      url: item.url,
      timestamp: formatTimestamp(item.lastVisitTime),
      frequency: item.visitCount,
      queries: extractSearchQueries(item.url),
      bookmarked: false, // Initialize bookmarked as false
    };

    // Check if the URL is bookmarked
    isBookmarked(item.url, function (bookmarked) {
      formattedItem.bookmarked = bookmarked;
      formattedHistory.push(formattedItem);
      processHistoryItem(index + 1);
    });
  }

  processHistoryItem(0);
}

function formatTimestamp(timestamp) {
  var date = new Date(timestamp);
  return date.toLocaleString();
}

function extractSearchQueries(url) {
  var queryParam = "q=";
  var queryStartIndex = url.indexOf(queryParam);
  var queryEndIndex = url.indexOf("&", queryStartIndex);
  if (queryEndIndex === -1) {
    queryEndIndex = url.length;
  }
  var query = url.substring(queryStartIndex + queryParam.length, queryEndIndex);
  return decodeURIComponent(query).split("+");
}

function extractSearchQuery(url) {
  var queryParam = "q=";
  var queryStartIndex = url.indexOf(queryParam);
  var queryEndIndex = url.indexOf("&", queryStartIndex);
  if (queryEndIndex === -1) {
    queryEndIndex = url.length;
  }
  var query = url.substring(queryStartIndex + queryParam.length, queryEndIndex);
  return decodeURIComponent(query);
}

function applyRankMasterAlgorithm(results, browserHistory) {
  const userBookmarks = browserHistory
    .filter((entry) => entry.bookmarked)
    .map((entry) => entry.url);

  // Define weights for each factor (you can adjust these weights as needed)
  const weights = {
    queryFrequency: 0.3,
    clickThroughRate: 0.2,
    citationCount: 0.2,
    publicationDate: 0.2,
    queryResultMatch: 0.1,
    userPreference: 0.1,
  };

  // Apply the RankMaster algorithm
  const rankedResults = results.map((result) => {
    const { title, authors, citation_count, url, publication_date, abstract } =
      result;

    // Calculate scores for each factor
    const queryFrequencyScore = browserHistory.reduce((score, entry) => {
      if (entry.queries.includes(title.toLowerCase())) {
        score += entry.frequency;
      }
      return score;
    }, 0);

    const clickThroughRateScore = browserHistory.reduce((score, entry) => {
      if (userBookmarks.includes(entry.url)) {
        score += entry.frequency;
      }
      return score;
    }, 0);

    const citationCountScore =
      citation_count !== undefined ? parseInt(citation_count) : 0;

    const publicationDateScore =
      publication_date !== ""
        ? new Date().getFullYear() - parseInt(publication_date)
        : 0;

    const queryResultMatchScore = browserHistory.some((entry) =>
      entry.queries.includes(title.toLowerCase())
    )
      ? 1
      : 0;

    const userPreferenceScore = userBookmarks.includes(result.url) ? 1 : 0;

    // Calculate the overall score using the weights and scores
    const overallScore =
      weights.queryFrequency * queryFrequencyScore +
      weights.clickThroughRate * clickThroughRateScore +
      weights.citationCount * citationCountScore +
      weights.publicationDate * publicationDateScore +
      weights.queryResultMatch * queryResultMatchScore +
      weights.userPreference * userPreferenceScore;

    return {
      title,
      authors,
      url,
      citation_count,
      publication_date,
      abstract,
      score: overallScore,
    };
  });

  // Sort the search results by the score in descending order
  rankedResults.sort((a, b) => b.score - a.score);

  return rankedResults;
}

function displayRankedResults(results) {
  var resultsList = document.getElementById("results-list");
  resultsList.innerHTML = ''; // Clear previous results

  results.forEach(function (result) {
    var listItem = document.createElement("li");
    var link = document.createElement("a");
    link.href = result.url; // Set the URL as the href attribute

    // Set the content of the link
    link.innerHTML = `
    <a href="${result.url}" target="_blank">
      <h3>${result.title}</h3>
      <p><b>Authors</b>: ${result.authors}</p>
      <p><b>Citation Count</b>: ${result.citation_count}</p>
      <p><b>Publication Date</b>: ${result.publication_date}</p>
      <p><b>Abstract</b>: ${result.abstract}</p>
      <p><b>Score</b>: ${result.score}</p>
      </a>
    `;

    listItem.appendChild(link);
    resultsList.appendChild(listItem);
  });
}

function calculateSimilarity(results, rankedResults) {
  const totalEntries = results.length;
  let totalMatch = 0;

  for (let i = 0; i < totalEntries; i++) {
    const originalTitle = results[i].title;
    const originalAuthor = results[i].authors;
    const originalAbstract = results[i].abstract;
    const originalPublicationDate = results[i].publication_date;

    const rankTitle = rankedResults[i].title;
    const rankAuthors = rankedResults[i].authors;
    const rankAbstract = rankedResults[i].abstract;
    const rankPublicationDate = rankedResults[i].publication_date;

    if (
      originalTitle === rankTitle &&
      originalAuthor === rankAuthors &&
      originalAbstract === rankAbstract &&
      originalPublicationDate === rankPublicationDate
    ) {
      totalMatch++;
    }
  }

  const similarity = (totalMatch / totalEntries) * 100;
  return similarity + "%";
}

function isBookmarked(url, callback) {
  chrome.bookmarks.search({ url: url }, function (bookmarks) {
    callback(bookmarks.length > 0);
  });
}
