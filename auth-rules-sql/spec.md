<aside>
🚧

Copy this page and then fill it in. Please don’t remove sections!

</aside>

# Overview

## Description of your system

Write a few sentences describing your authorization system, assuming the reader knows nothing about it.

## Technical details

Describe in more detail how your system would be implemented or generally work. Not everyone will read this, but can spark some new ideas or discussion.

# Dropbox App Test

Describe the outline of your Dropbox app so readers can get a sense of how it works.

## Data model

Show us the ER diagram or `create table` statements, to be able to understand the illustrations below.

# Illustrations: Signed in user in the app’s dashboard

These illustrations show user-to-server communication, via a web application (dashboard). This is the most common path of a user interacting with the Dropbox application, and what most developers will need to build out first.

## List file system

Suppose the developer needs to build a page that lists their “file system” — all the top-level files and folders the user has access to. Very similar to doing `ls /` . Show an illustration with pseudocode or your language of choice on how this API or page would be implemented by the developer.

Access to the file listing is separate to file access. A user may be able to list the files in a directory, but not be able to view the file. If they are able to view the file, then they can definitely list it.

Assume that directories can be shared between users (like inviting a user to a directory in Dropbox) and those shared directories appear under the root listing.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

### Supports recursive paths? (Yes / No)

Can the user specify a sub-directory and how does that work?

### Supports pagination? (Yes / No)

Some sub-directories may have up to a million entries. How does that work? What is the expected performance?

Explore the different types of pagination (offset / token / etc). Pagination stability?

### Supports counting? (Yes / No / Estimate)

Identifying how many files are in one directory (recursive and flat) is a hard problem. How would you go about solving this with your solution? What is the expected performance?

## View file

Suppose the developer needs to build the “file open” functionality for a user who has a file path (a description of the file’s location or unique ID — not a pre-signed URL). Show an illustration with pseudocode or your language of choice on how this API or page would be implemented.

Assume the developer is using Supabase Storage to store the actual file contents. You can use RLS on the `storage` schema or pre-signed URLs once the access to the file has been “checked.”

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## Upload file

Suppose the developer needs to build a file upload feature. The file gets added to a directory according to these rules:

1. User can list directory AND
2. User can upload into directory

Assume that the files are text files for simplicity, and that their content needs to be added both to Postgres’ full-text search capability and an external search service (like ElasticSearch). Spend some time designing which content gets added and in what way. This should help with the Search through files illustration.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## Move file to another location

Suppose the developer needs to build a move file feature. The file can only be moved from location A to location B if and only if the user has sufficient privileges for the file itself and both locations! This results in about 3 separate authorization checks before the operation can take place.

Illustrate how your system works for this situation. Ensure that moving the file accordingly adjusts results from the search functionality.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## Add comment to file

Suppose the developer needs to build a “file comment” functionality for a user who has a file path (a description of the file’s location or unique ID — not a pre-signed URL). The user adds a comment to the file according to these rules:

1. User has view access to the file AND
2. User has view comment access to the file AND
3. User has add comment access to the file

Show an illustration with pseudocode or your language of choice on how this API or page would be implemented.

Assume comments are just added toplevel to the file, for simplicity sake.

When a comment is added, show how a Supabase Realtime event fires on the file notifying the UI that there’s a change in the comments. The UI can refresh the list on that signal.

Comments should be searchable (full text search). Illustrate two approaches: Postgres’ native full-text search and using an external service (like ElasticSearch). Illustrate the data that’s saved in Postgres and in the external service, then explain the search functionality in [Search through comments](https://www.notion.so/Template-Project-ZX-Dropbox-App-Evaluation-Sheet-3035004b775f804e860ce8f90458467c?pvs=21) below.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## View file comments

Suppose the developer needs to render the comments for a single file via its path (a description of the file’s location or unique ID — not a pre-signed URL) for a particular user viewing the page. The rules for this are:

1. User has view access to the file AND
2. User has view comments access to the file OR
3. User has added their own comments to the file (user can always view their own comments)

Show an illustration with pseudocode or your language of choice on how this API or page would be implemented.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## Remove file comment

Suppose the developer needs to add a delete/remove comment feature for a single file. They know the file’s path (a description of the file’s location or unique ID — not a pre-signed URL) and the comment’s unique ID. The rules for this are:

1. User has view access to the file AND
2. User has view comments access to the file AND
3. User has remove comments access to the file OR
4. User is removing their own comment that was previously added to the file (user can always remove their own comment)

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## Search through comments

An important function of an application like Dropbox is having the ability to full-text search through comments. In the Add comment to file illustration you needed to show how a comment’s data is added to both Postgres’ full-text search engine and also sent to an external search service like ElasticSearch. Now comes the hard part — retrieving the data and showing only the comments that a particular user can see based on the global access they have over all files they own or have been shared with them.

In this illustration show how your system can use both Postgres’ full-text search engine and separately on how an external search service can be used. As this problem is quite hard to solve, spend a lot more time thinking through it and writing up how your approach can be used to build this functionality. If possible offer multiple options.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## Search through files

An important function of an application like Dropbox is having the ability to full-text search through file’s contents. In the Upload file illustration you needed to show how a file’s contents is added both to Postgres’ full-text search engine and also sent to an external service like ElasticSearch. Retrieving the data and filtering which files should be visible by the user searching is the hard part. You need to make sure that a user can only search through the files it has access to.

In this illustration show how your system can use both Postgres’ full-text search engine and separately on how an external search service can be used. As this problem is quite hard to solve, spend a lot more time thinking through it and writing up how your approach can be used to build this functionality. If possible offer multiple options.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

# Illustrations: Permalink-based file sharing

A signed in user can generate a viewer-only link to a file they control. These illustrations show how the link is validated to eventually reveal the file’s contents. For simplicity, file comments are not revealed.

## Generate permalink

A signed in user that has access to any file can generate an unpredictable permalink to the file, that can be sent to any other human to open in a browser. Show how the permalink is generated but pay attention to the transitive access property of the link: if the user who created the permalink looses access, the link should also become invalid when checked.

Illustrate how access is checked before a link is generated for a file and how the access is encoded so that it can be revoked when the user generating the link eventually looses access to the file.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## Use permalink

Any human with access to a file permalink can use it to obtain the file’s contents.

Illustrate how access is checked when there is no signed in user, and all you know about the request is the URL. Ensure that when the user who generated the link looses access to the underlying file, the link is no longer valid. Also don’t forget the file can be deleted so how is access removed?

**Illustration**

Add your illustration description here…

```tsx

```

More context…

# Illustrations: Server-to-Server

An important aspect of building non-trivial applications is considering server-to-server authorization. In applications like Dropbox, this means API-based access on files. Usually this access is conveyed through protocols like OAuth, but can be any other way (like generating a PAT, or organization-level credentials).

Unlike a signed in user using a web-based interface, which can use technologies like PostgREST directly on the client side, server-to-server communication requires stable, versioned APIs that cannot be yanked out from the APIs consumers. This is an important goal of these illustrations, forcing you to demonstrate how your system can be used to build stable APIs.

## Give read/write access to a server

Suppose the developer needs to build APIs for managing the user’s files. To do this, the user has to say which directories the server will have access to and in what way (read only or full access).

Demonstrate how in your system the server’s authorization token is generated, how it encodes which server it is and where it has access to. Think of the transitive properties on how the server’s access changes when the user’s access changes.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## Move file to another location

Suppose the developer needs to build a move file feature as a stable API to be used by a server. The file can only be moved from location A to location B if and only if the server’s token has sufficient privileges for the file itself and both locations! This results in about 3 separate authorization checks before the operation can take place.

Illustrate how your system works for this situation. Ensure that moving the file accordingly adjusts results from the search functionality.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

# Illustrations: Operability, extensibility and backoffice

Applications don’t live in isolation. They are used by our developer’s customers, which expect support. This means we also need to evaluate how easy some authorizations systems are to work with by the developers themselves, including their support teams.

## Introduce a team

In the original illustrations you should not have designed access rules based on a team, but a single user. This was intentional, so that you can show how that operational system will need to change to introduce an entity — team — that users are members of.

Pick a few key flows and illustrate what developers need to do to grow into this new capability of their Dropbox app.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## Re-assign permissions after a bug

Suppose the developer’s application had a bug in the move file functionality. When a file was moved from location A to location B, the user performing the move lost access to the file. How does this bug manifest in your authorization system? Is it data loss, or is it a programming bug.

Illustrate how, once the bug is discovered, the system can be changed by the developers to ensure that all moved files with incorrect permissions will have their permissions restored.

**Illustration**

Add your illustration description here…

```tsx

```

More context…

## User impersonation / temporary support access

Often applications can misbehave in unusual ways, that someone needs to use a user’s account or join their workspace to work out what is going on.

Illustrate how a support person will be able to impersonate a particular user to debug the system, or be given temporary access to the files to work out the issue.

**Illustration**

Add your illustration description here…

```tsx

```

More context…
