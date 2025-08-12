# toy-blog

Toy blog engine / static site generator that lets you specify a template and publish HTML/JS posts with it. To use it, 4 things are required:
- Index page template
- Post template
- Directory containing post files, which must contain some metadata, but can otherwise include arbitrary HTML (which can reference other files)
- Output directory

[toy-blog-engine](https://www.npmjs.com/package/toy-blog-engine) can be installed via NPM:
```
$ npm install toy-blog-engine
```

This installs a CLI tool `toyb`. Run with the above arguments to generate HTML files for a blog with an index and posts. Example usage:
```
$ npm exec toyb --index-template source/index.html --post-template source/post.html --posts source/posts --output output/
Options:
  --help            Show help                                          [boolean]
  --version         Show version number                                [boolean]
  --index-template  The template file to use for index page. [string] [required]
  --post-template   The template file to use for posts.      [string] [required]
  --posts           Directory containing posts.              [string] [required]
  --output          Directory to put generated HTML files and other output.
                                                             [string] [required]
  --clean           If true (default false), then clears output directory before
                    generating files.                 [boolean] [default: false]
  --descending      If true (default true), then generates links in descending
                    order of post date (newest first). [boolean] [default: true]

```

The tool is barebones right now and is intended to be as flexible as possible. For example, you can include arbitrary non-post content
in the directory containing post files, and then have the post HTML reference these files. The output will copy over these files verbatim.
This is a useful way to have posts include interactive content and styling in the form of CSS/JS/media.

## Development

The code is in Typescript in `cli.ts`, with a test website (inputs and snapshots) in the `test/` directory. After modifying the TS source, test with `npm run test` and build the JS distributable via `npm run build`.