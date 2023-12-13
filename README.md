# toy-blog

Toy blog engine that lets you specify a template and publish HTML/JS posts with it. To use it, 4 things are required:
- Index page template
- Post template
- Directory containing post files, which must contain some metadata, but can otherwise include arbitrary HTML (which can reference other files)
- Output directory

Running the CLI tool with these arguments will generate HTML files for a blog with an index and posts.

The tool is barebones right now and is intended to be as flexible as possible. For example, you can include arbitrary non-post content
in the directory containing post files, and then have the post HTML reference these files. The output will copy over these files verbatim.
This is a useful way to have posts include interactive content and styling in the form of CSS/JS/media.