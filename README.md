# Letterboxd Contribution Graph

![Letterboxd Contribution Graph](images/letterboxd-graph.svg)

This repository contains a GitHub Action that generates a GitHub-style contribution graph from your Letterboxd film diary.

## How It Works

1. The action automatically runs daily to fetch your latest Letterboxd activity
2. It scrapes your public Letterboxd diary page for film entries
3. Generates a contribution graph similar to GitHub's, showing your film watching activity
4. Commits the updated SVG to the repository

## Usage

### Using this action in your own repository

1. Create a new repository or use an existing one
2. Create the workflow file at `.github/workflows/update-graph.yml`:

```yaml
name: Update Letterboxd Contribution Graph

on:
  schedule:
    # Run daily at midnight
    - cron: "0 0 * * *"
  workflow_dispatch: # Allow manual triggering

jobs:
  update-graph:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Generate Letterboxd contribution graph
        uses: yourusername/letterboxd-contribution-graph@main
        id: generate-graph
        with:
          letterboxd-username: 'your-letterboxd-username'
          output-path: 'images/letterboxd-graph.svg'
      
      - name: Commit and push if changed
        run: |
          git config --global user.name 'GitHub Action'
          git config --global user.email 'action@github.com'
          git add images/letterboxd-graph.svg
          git diff --quiet && git diff --staged --quiet || (git commit -m "Update Letterboxd contribution graph" && git push)

