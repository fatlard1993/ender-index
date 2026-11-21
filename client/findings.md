Every jar the index lists is downloaded once and scanned for what its code can reach beyond the game: the network, other programs, native code, memory past Java's checks, and classes it defines while running. Each thing found is a finding. ender runs the same scan on your own machine when it updates a mod, so a finding here and a finding there mean the same thing.

**A finding is not a verdict.** An update checker reaches the network; a performance mod uses `Unsafe`. Most findings have an ordinary reason, and the index approves and rejects nothing. What a finding tells you is where a mod's code can go, so you can ask whether that fits what the mod is for. A decorative blocks mod that reaches the network is worth a second look; a voice chat mod that does not would be strange.

Where its author has explained a finding, the explanation shows beside it, marked as theirs: the index has not checked it.

## How the scan works

The scan reads the compiled classes in the jar, and in any jar nested inside it, for the Java calls that grant each capability. It does not run the mod. A class that calls `java.net.http.HttpClient`, for example, is a network finding, and the mod's page lists that class and the call under it.

So a finding means the code is there, not that it runs. A mod that checks for updates only when its setting is on still reaches the network, because the code to do it is in the jar.

A jar that looks classes up by name, with `Class.forName` or a class loader's `loadClass`, is also held to the classes its strings name: a string reading `java.lang.Runtime` counts as everything `Runtime` can do.

## What the scan cannot see

- A class name built or decrypted while the mod runs, or kept in a resource file rather than the code.
- A lookup made only through reflection's `Method.invoke` or a method handle, with no `Class.forName` in the jar.
- What native code does, once a mod loads it: see [native](#native).
- Code that arrives later: a mod that defines classes while running can load code no scan of the jar has read. See [classloading](#classloading).
- Other jars: each mod a mod depends on is scanned as its own jar, and Minecraft and its loader are not scanned.

That is why the findings that matter most are the ones that change. When an update reaches something the version before it did not, ender says so before you launch it, and a jar replaced after it was published is marked on the mod's page. A trusted mod quietly given a payload, as [fractureiser](https://github.com/trigram-mrp/fractureiser) did in 2023, shows up exactly that way.

## Network

Its code can open network connections: an HTTP request, a socket, a URL opened as a stream.

**Why a mod might:** checking for a newer version, reading skins or capes, voice chat, a web map, Discord status, reporting crashes, or talking to a service the mod is built around.

**What to look at:** whether the mod has a reason to, and the [hosts](#hosts) its strings name. A network finding that appears in an update to a mod that never had one is the pattern to stop on.

**What grants it:** `java.net.URL.openConnection`, `java.net.URL.openStream`, `java.net.Socket`, `java.net.DatagramSocket`, `java.net.http.HttpClient`, `java.nio.channels.SocketChannel`.

**For its author:** an update checker is the most common network finding, and ender and Modrinth already tell players when a mod has a newer version, so one can often go. Otherwise, [explain it](#for-authors): what the mod connects to, and why.

## Exec

Its code can start other programs on the player's computer.

**Why a mod might:** opening a folder or a link in the system's own app, or running a tool the mod works with, like a video encoder.

**What to look at:** this is the rarest finding and the one with the least room for doubt about what code can do once it has it. Few mods need it, and a content mod almost never does.

**What grants it:** `java.lang.Runtime.exec`, `java.lang.ProcessBuilder`.

**For its author:** to open a folder or a link, Minecraft's own `Util` does it for you (`Util.getPlatform().openUri` in Mojang's names, `Util.getOperatingSystem().open` in Yarn's), and its code is not part of your jar, so the finding goes away.

## Native

Its code can load a native library: machine code for one system, outside Java altogether.

**Why a mod might:** speed, audio codecs for voice chat, compression, or a library that only exists as native code, like Discord's.

**What to look at:** native code is outside anything the scan can read, so once it loads, the scan cannot say what it does. Prefer mods that ship well-known libraries, and be wary of one that loads a library it downloaded.

**What grants it:** `java.lang.System.load`, `java.lang.System.loadLibrary`, `java.lang.Runtime.load`, `java.lang.Runtime.loadLibrary`.

**For its author:** say which library it is and where it comes from, since that is what a player cannot see for themselves.

## Unsafe

Its code uses `sun.misc.Unsafe`, which reads and writes memory past Java's own checks.

**Why a mod might:** performance. Optimization mods and the libraries many mods bundle use it to do what plain Java does more slowly.

**What to look at:** usually nothing. It matters most as a sign of how close to the metal a mod works, and a crash it causes can be harder to trace.

**What grants it:** `sun.misc.Unsafe`, `jdk.internal.misc.Unsafe`.

**For its author:** if it comes from a library you bundle rather than your own code, say which; the mod's page lists the classes that use it.

## Classloading

Its code can define new classes while it runs, from bytes it holds or fetches.

**Why a mod might:** frameworks that generate code, scripting, a language runtime bundled with the mod, or loading add-ons from a folder.

**What to look at:** code defined while the mod runs can be code no scan has read, so this finding is the scan saying where it stops. With a [network](#network) finding beside it, a mod can fetch code and run it; that is what fractureiser's payload did, and the pairing deserves a clear reason.

**What grants it:** `ClassLoader.defineClass`, `SecureClassLoader.defineClass`, `java.net.URLClassLoader`, `MethodHandles.Lookup.defineClass` and `defineHiddenClass`, and any class extending one of those class loaders.

**For its author:** say what the mod defines classes from, and whether any of it comes over the network.

## Hosts

The web addresses named in its code's strings, like `api.modrinth.com`. This is not a capability: a link to the mod's wiki is a host as much as an API is.

**Why a mod might:** links it shows players, an update or skin service it calls, an issue tracker for crash reports.

**What to look at:** alongside a [network](#network) finding, the hosts are the likeliest places it connects to. A host you do not recognize, or one that appears in an update, is worth knowing about.

**For its author:** say which hosts the mod connects to and which are only links it shows.

## For authors

A finding has two answers.

- **Change the mod** so the code that grants it is gone: drop the dependency that brings it, or use what Minecraft or the loader already does. A setting that turns the code off does not remove the finding, because the scan reads what is in the jar.
- **Explain it** in your own words, shown beside the finding on your mod's page: [open an Explain a finding issue](https://github.com/fatlard1993/ender-index/issues/new?template=explain.yml) from your GitHub account. The [authors guide](https://fatlard1993.github.io/ender-index/authors/explaining-a-finding) says who can and how to change it later.

Each finding on your mod's page lists the classes that have it and the calls that grant it, which is where to start looking.
