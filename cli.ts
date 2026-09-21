#!/usr/bin/env node

import * as fs from 'fs'
import * as path from 'path'
import * as yargs from 'yargs'

import { JSDOM } from 'jsdom'

interface Post {
  filename: string
  title: string
  date: Date
  headElement: Element | null
  inputElement: Element
  inputDOM: JSDOM
  isStarred: boolean
  isDraft: boolean
  // If non-null, this is an external post which links to this URL instead of generating a page
  externalURL: string | null
}

// "Box with arrow" icon shown next to external posts in navigation. Uses currentColor so it can be styled via CSS.
const EXTERNAL_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="0.8em" height="0.8em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>'

function isValidURL(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Navigation list item for a post. `postsPath` is the relative path from the page being generated to the posts directory.
// External posts link directly to their URL and are marked with the `toyb-nav-li-external` class and an icon.
function makeNavItemHTML(post: Post, postsPath: string): string {
  const dateString = `<span class="toyb-nav-li-date">${post.date.toISOString().split('T')[0]}</span>`
  if (post.externalURL !== null) {
    const iconString = `<span class="toyb-nav-external-icon" title="External post">${EXTERNAL_ICON_SVG}</span>`
    return `<li class="toyb-nav-li-external">${dateString} <span class="toyb-nav-li-link"><a href="${escapeAttribute(post.externalURL)}">${post.title}</a> ${iconString}</span></li>`
  }
  return `<li>${dateString} <span class="toyb-nav-li-link"><a href="${postsPath}${post.filename}">${post.title}</a></span></li>`
}

// Post template
// Required:
// - Exactly 1 <toyb-article></toyb-article> with no content inside, which will output the post content
// Optional:
// - <toyb-date></toyb-date> tag which will output the post date
// - <toyb-title></toyb-title> tag which will output the post title
// - <toyb-nav></toyb-nav> tag which will output the navigation links
// - <toyb-draft></toyb-draft> tag - if included, post is considered a draft and will be accessible via ./posts URL, but not added to index
// - <toyb-star></toyb-star> tag - if included, post is starred in the index
function makePostHTML(index: number, posts: Post[], templateDOM: JSDOM): string {
  const post = posts[index]
  const postDOM = new JSDOM(templateDOM.window.document.documentElement.outerHTML)

  let navString  = '<navigation class="toyb-nav"><ul>'
  for (let post of posts) {
    navString += makeNavItemHTML(post, './')
  }
  navString += '</ul></navigation>'

  const postTitleString = `${post.title}`
  const postDateString = `${post.date.toDateString()}`
  const postContentString = `<article class="toyb-article">${post.inputElement.innerHTML}</article>`

  function visit(element: Element) {
    switch (element.tagName?.toLowerCase()) {
      case 'toyb-nav': {
        element.outerHTML = navString
        break
      }
      case 'title': {
        element.innerHTML = postTitleString
        break
      }
      case 'toyb-title': {
        element.outerHTML = postTitleString
        break
      }
      case 'toyb-date': {
        element.outerHTML = postDateString
        break
      }
      case 'toyb-article': {
        element.outerHTML = postContentString
        break
      }
      case 'head': {
        if (element.childNodes) {
          for (let child of element.childNodes) {
            visit(child as Element)
          }
        }
        if (post.headElement) {
          element.innerHTML += post.headElement.innerHTML
        }
        break
      }
      default: {
        if (element.childNodes) {
          for (let child of element.childNodes) {
            visit(child as Element)
          }
        }
      }
    }
  }
  visit(postDOM.window.document.documentElement)
  return '<!DOCTYPE html>' + postDOM.window.document.documentElement.outerHTML
}

// Index template
// Optional:
// - <toyb-nav></toyb-nav> tag which will output the navigation links
function makeIndexHTML(posts: Post[], indexDOM: JSDOM): string {
  let navString  = '<navigation class="toyb-nav"><ul class="nav">'
  for (let post of posts) {
    if (post.isDraft) {
      continue
    }
    navString += makeNavItemHTML(post, './posts/')
  }
  navString += '</ul></navigation>'
  function visit(element: Element) {
    if (element.tagName?.toLowerCase() === 'toyb-nav') {
      element.outerHTML = navString
    } else {
      if (element.childNodes) {
        for (let child of element.childNodes) {
          visit(child as Element)
        }
      }
    }
  }
  visit(indexDOM.window.document.documentElement)
  return '<!DOCTYPE html>' + indexDOM.window.document.documentElement.outerHTML
}

// Validates and returns the <toyb-title> and <toyb-date> tags of a <toyb-post> or <toyb-external> element
function parsePostMetadata(element: Element, filename: string): { titleElement: Element, dateElement: Element, dateTimestamp: number } {
  const titleElement = element.querySelector('toyb-title')
  if (titleElement === null || titleElement.innerHTML === '') {
    throw new Error(`Post with input file ${filename} must have a non-empty <toyb-title> tag`)
  }
  const dateElement = element.querySelector('toyb-date')
  const dateTimestamp = Date.parse(dateElement?.innerHTML || '')
  if (dateElement === null || Number.isNaN(dateTimestamp)) {
    throw new Error(`Post with input file ${filename} must have a valid <toyb-date> tag`)
  }
  return { titleElement, dateElement, dateTimestamp }
}

export function main(): number {
  const args = yargs
    .option('index-template', {
      type: 'string',
      describe:
        "The template file to use for index page.",
      demandOption: true,
    })
    .option('post-template', {
      type: 'string',
      describe:
        "The template file to use for posts.",
      demandOption: true,
    })
    .option('posts', {
      type: 'string',
      describe: 'Directory containing posts.',
      demandOption: true,
    })
    .option('output', {
      type: 'string',
      describe: 'Directory to put generated HTML files and other output.',
      demandOption: true,
    })
    .option('clean', {
      type: 'boolean',
      default: false,
      describe:
        'If true (default false), then clears output directory before generating files.',
    })
    .option('descending', {
      type: 'boolean',
      default: true,
      describe:
        'If true (default true), then generates links in descending order of post date (newest first).',
    })
    .parseSync(process.argv.slice(2))

  // 1. Read post template
  // - It must have exactly 1 <toyb-article></toyb-article> with no content inside, which will output the post content
  // - It may include <toyb-date></toyb-date> tag which will output the post date
  // - It may include <toyb-title></toyb-title> tag which will output the post title
  // - It may include <toyb-nav></toyb-nav> tag which will output the navigation links
  const postTemplate = new JSDOM(fs.readFileSync(args['post-template']!, 'utf8'))
  const postTemplateArticles = Array.from(postTemplate.window.document.querySelectorAll('toyb-article'))
  if (postTemplateArticles.length === 1) {
    const postTemplateArticle = postTemplateArticles[0]
    if (postTemplateArticle.innerHTML !== '') {
      throw new Error("Post template <toyb-article> tag must have no content.")
    }
  } else {
    throw new Error("Post template must have exactly one <toyb-article> tag.")
  }

  // 2. Read index template
  // - It may include <toyb-nav></toyb-nav> tag which will output the navigation links
  const indexTemplate = new JSDOM(fs.readFileSync(args['index-template']!, 'utf8'))

  // 3. Read posts directory
  // - Each HTML file in directory is treated as a post if it contains a <toyb-post></toyb-post> tag,
  //   this will generate an HTML file to [output-dir]/posts/[file-name], as well as a link in the navigation,
  //   where navigation links are ordered by date. This does not include nested HTML files.
  // - All other files (including nested files) in directory are output to [output-dir]/posts/[file-name] verbatim
  // - A post must include <toyb-date></toyb-date> tag inside the <toyb-post></toyb-post>, contents must be parseable by Date.parse()
  // - A post must include <toyb-title></toyb-title> tag inside the <toyb-post></toyb-post> with non-empty post title
  // - A post may include <toyb-head></toyb-head> tag inside the <toyb-post></toyb-post> which will be added to the <head> of the post
  // - Each HTML file in directory is treated as an external post if it contains a <toyb-external></toyb-external> tag,
  //   this will generate a link in the navigation to an external URL (marked with an icon), but no HTML file.
  // - An external post must include <toyb-title> and <toyb-date> tags as above, as well as a <toyb-url></toyb-url> tag
  //   containing the absolute URL to link to. It may include <toyb-draft> and <toyb-star> tags. Other content is ignored.
  const outputDir = args['output']!
  if (args['clean']) {
    fs.rmSync(outputDir, { recursive: true, force: true })
    fs.mkdirSync(outputDir, { recursive: true })
  }
  // First, generate all non-post output files, and collect all posts so that we can generate correct links, etc. later
  const posts: Post[] = []
  const files = fs.readdirSync(args['posts']!, { recursive: false, encoding: 'utf8' })
  files.forEach(function (filename) {
    var filePath = path.join(args['posts']!, filename)
    const stat = fs.statSync(filePath)

    if (stat.isFile()) {
      if (filePath.endsWith(".html")) {
        const fileHTML = fs.readFileSync(filePath, 'utf8')
        const fileDOM = new JSDOM(fileHTML)
        const postElement = fileDOM.window.document.querySelector('toyb-post')
        const externalElement = fileDOM.window.document.querySelector('toyb-external')
        if (postElement && externalElement) {
          throw new Error(`Input file ${filename} cannot contain both a <toyb-post> and a <toyb-external> tag`)
        }
        if (externalElement) {
          const { titleElement, dateTimestamp } = parsePostMetadata(externalElement, filename)
          const urlElement = externalElement.querySelector('toyb-url')
          const externalURL = urlElement?.textContent?.trim() || ''
          if (!isValidURL(externalURL)) {
            throw new Error(`External post with input file ${filename} must have a <toyb-url> tag containing a valid absolute URL`)
          }
          posts.push({
            filename,
            title: titleElement.innerHTML,
            date: new Date(dateTimestamp),
            headElement: null,
            inputElement: externalElement,
            inputDOM: fileDOM,
            isDraft: !!externalElement.querySelector('toyb-draft'),
            isStarred: !!externalElement.querySelector('toyb-star'),
            externalURL,
          })
        } else if (postElement) {
          const { titleElement, dateElement, dateTimestamp } = parsePostMetadata(postElement, filename)
          const headElement = postElement.querySelector('toyb-head')
          // Strip the title, date, and head elements so they don't appear directly in HTML output
          postElement.removeChild(titleElement)
          postElement.removeChild(dateElement)
          if (headElement) {
            postElement.removeChild(headElement)
          }
          const isDraft = !!postElement.querySelector('toyb-draft')
          const isStarred = !!postElement.querySelector('toyb-star')
          posts.push({
            filename,
            title: titleElement.innerHTML,
            date: new Date(dateTimestamp),
            headElement,
            inputElement: postElement,
            inputDOM: fileDOM,
            isDraft,
            isStarred,
            externalURL: null,
          })
        } else {
          fs.writeFileSync(path.join(outputDir, 'posts', filename), fileHTML)
          console.log(`Copied file ${filePath} to ${path.join(outputDir, 'posts', filename)}`)
        }
      } else {
        fs.cpSync(filePath, path.join(outputDir, 'posts', filename))
        console.log(`Copied file ${filePath} to ${path.join(outputDir, 'posts', filename)}`)
      }
    } else if (stat.isDirectory()) {
      fs.cpSync(filePath, path.join(outputDir, 'posts', filename), {recursive: true})
      console.log(`Copied directory ${filePath} to ${path.join(outputDir, 'posts', filename)}`)
    }
  })

  // Now generate all HTML files which depend on posts for links etc. (including posts themselves)
  posts.sort((a, b) => {
    if (args['descending']) {
      return b.date.getTime() - a.date.getTime()
    }
    return a.date.getTime() - b.date.getTime()
  })
  for (let i = 0; i < posts.length; i++) {
    if (posts[i].externalURL !== null) {
      continue
    }
    const postHTML = makePostHTML(i, posts, postTemplate)
    fs.writeFileSync(path.join(outputDir, 'posts', posts[i].filename), postHTML)
    console.log(`Generated post ${path.join(outputDir, 'posts', posts[i].filename)} for title ${posts[i].title}`)
  }
  const indexHTML = makeIndexHTML(posts, indexTemplate)
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHTML)
  console.log(`Generated index ${path.join(outputDir, 'index.html')}`)
  console.log("Done!")

  return 0
}

if (require.main === module) {
  main()
}