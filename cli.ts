#!/usr/bin/env node

import * as fs from 'fs'
import * as path from 'path'
import yargs from 'yargs'

import { JSDOM } from 'jsdom'

interface Post {
  filename: string
  title: string
  date: Date
  inputElement: Element
  inputDOM: JSDOM
}

// Post template
// - It must have exactly 1 <toyb-article></toyb-article> with no content inside, which will output the post content
// - It may include <toyb-date></toyb-date> tag which will output the post date
// - It may include <toyb-title></toyb-title> tag which will output the post title
// - It may include <toyb-nav></toyb-nav> tag which will output the navigation links
function makePostHTML(index: number, posts: Post[], templateDOM: JSDOM): string {
  const post = posts[index]
  const postDOM = new JSDOM(templateDOM.window.document.documentElement.outerHTML)

  let navString  = '<navigation class="toyb-nav"><ul>'
  for (let post of posts) {
    navString += `<li><a href="posts/${post.filename}">${post.title}</a></li>`
  }
  navString += '</ul></navigation>'

  const postTitleString = `<h1 class="toyb-title">${post.title}</h1>`
  const postDateString = `<h3 class="toyb-subtitle">${post.date.toDateString()}</h3>`
  const postContentString = `<article class="toyb-article">${post.inputElement.innerHTML}</article>`

  function visit(element: Element) {
    switch (element.nodeName) {
      case 'toyb-nav': {
        element.outerHTML = navString
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
      default: {
        if (element.childNodes) {
          for (let child of element.childNodes) {
            if (child instanceof Element) {
              visit(child)
            }
          }
        }
      }
    }
  }
  visit(postDOM.window.document.documentElement)
  return postDOM.window.document.documentElement.outerHTML
}

// Index template
// - It may include <toyb-nav></toyb-nav> tag which will output the navigation links
function makeIndexHTML(posts: Post[], indexDOM: JSDOM): string {
  let navString  = '<navigation><ul class="nav">'
  for (let post of posts) {
    navString += `<li><a href="posts/${post.filename}">${post.title}</a></li>`
  }
  navString += '</ul></navigation>'
  function visit(element: Element) {
    if (element.nodeName === 'toyb-nav') {
      element.outerHTML = navString
    } else {
      if (element.childNodes) {
        for (let child of element.childNodes) {
          if (child instanceof Element) {
            visit(child)
          }
        }
      }
    }
  }
  visit(indexDOM.window.document.documentElement)
  return indexDOM.window.document.documentElement.outerHTML
}

export function main(): number {
  const args = yargs
    .option('index-template', {
      type: 'string',
      describe:
        "The template file to use for index page.",
    })
    .option('post-template', {
      type: 'string',
      describe:
        "The template file to use for posts.",
    })
    .option('posts', {
      type: 'string',
      describe: 'Directory containing posts.',
    })
    .option('output', {
      type: 'string',
      describe: 'Directory to put generated HTML files and other output.',
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
  const outputDir = args['output']!
  // First, generate all non-post output files, and collect all posts so that we can generate correct links, etc. later
  const posts: Post[] = []
  fs.readdir(args['posts']!, function (err, files) {
    if (err) {
      console.error("Could not list the directory.", err)
      process.exit(1)
    }

    files.forEach(function (filename) {
      var filePath = path.join(args['posts']!, filename)
      fs.stat(filePath, function (error, stat) {
        if (error) {
          throw error
        }

        if (stat.isFile()) {
          if (filePath.endsWith(".html")) {
            const fileHTML = fs.readFileSync(filePath, 'utf8')
            const fileDOM = new JSDOM(fileHTML)
            const postElement = fileDOM.window.document.querySelector('toyb-post')
            if (postElement) {
              const titleElement = postElement.querySelector('toyb-title')
              if (titleElement === null || titleElement.innerHTML === '') {
                throw new Error(`Post with input file ${filename} must have a non-empty <toyb-title> tag`)
              }
              const dateElement = postElement.querySelector('toyb-date')
              const dateTimestamp = Date.parse(dateElement?.innerHTML || '')
              if (Number.isNaN(dateTimestamp)) {
                throw new Error(`Post with input file ${filename} must have a valid <toyb-date> tag`)
              }
              // Strip the title and date elements so they don't appear directly in HTML output
              postElement.removeChild(titleElement)
              postElement.removeChild(dateElement!)
              posts.push({
                filename,
                title: titleElement.innerHTML,
                date: new Date(dateTimestamp),
                inputElement: postElement,
                inputDOM: fileDOM,
              })
            } else {
              fs.writeFileSync(path.join(outputDir, 'posts', filename), fileHTML)
            }
          } else {
            fs.cpSync(filePath, path.join(outputDir, 'posts', filename))
          }
        } else if (stat.isDirectory()) {
          fs.cpSync(filePath, path.join(outputDir, 'posts', filename), {recursive: true})
        }
      })
    })
  })

  // Now generate all HTML files which depend on posts for links etc. (including posts themselves)
  posts.sort((a, b) => {
    if (args['descending']) {
      return b.date.getTime() - a.date.getTime()
    }
    return a.date.getTime() - b.date.getTime()
  })
  for (let i = 0; i < posts.length; i++) {
    const postHTML = makePostHTML(i, posts, postTemplate)
    fs.writeFileSync(path.join(outputDir, 'posts', posts[i].filename), postHTML)
  }
  const indexHTML = makeIndexHTML(posts, indexTemplate)
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHTML)

  return 0
}

if (require.main === module) {
  main()
}