Every jar the index lists is downloaded once and scanned for what its code can reach beyond the game: the network, other programs, native code, memory past Java's checks, and classes it defines while running. Each thing found is a finding. The scan also warns of what can go either way, like a chat webhook or the session token, and says outright when a jar names where other programs keep their logins. ender runs the same scan on your own machine when it installs and updates a mod, so a finding here and a finding there mean the same thing.

**A finding is not a verdict.** An update checker reaches the network; a performance mod uses `Unsafe`. Most findings have an ordinary reason, and the index approves and rejects nothing. What a finding tells you is where a mod's code can go, so you can ask whether that fits what the mod is for. A decorative blocks mod that reaches the network is worth a second look; a voice chat mod that does not would be strange.

Where its author has explained a finding, the explanation shows beside it, marked as theirs: the index looked it over before it showed, but has not checked what it says.

A finding that only comes from a library the jar bundles, like a database driver, says so: the mod's own code does not reach it, though the library is still part of what runs. A jar carried inside the mod is a library for certain, shown as "In sqlite-jdbc.jar, a library it bundles". A class can also look like a library's without being in a jar of its own, shown as "In what looks like org.h2, a library it bundles": its package is one a well-known library keeps, like `org.sqlite` or `okhttp3`, or it sits under a folder a build moves libraries into, like `shadow`, `shaded`, `deps`, `libs` or `relocated`, inside the mod's own package. That is a guess from the package's name alone, which the mod's author chooses, so a mod's own code can trigger it; a folder as plain as `lib` does not count, since mods keep their own helpers there. A finding only in such packages says "only in what look like libraries it bundles", and its classes are listed all the same.

## How much each matters

Each finding on a mod's page says how much it should make you stop and look, in a word, with what it usually means beside it:

- **Common:** many good mods have it, and it usually means what it says: [talks to the internet](#network), [goes past Java's memory checks](#unsafe), [names web addresses](#hosts).
- **Worth a look:** fine for some mods and odd for others, so ask whether it fits this one: [loads code while it runs](#classloading), [runs native code](#native), [posts into a chat](#webhook), [reads your login token](#session), [uses your clipboard](#clipboard), [has code its source does not](#unsourced), [has code the scan could not read](#unreadable).
- **Unusual:** few mods have any reason for it: [starts other programs](#exec), [starts with your computer](#persistence), [hides code](#hidden), [reaches out as it loads](#initializer), [is built to read two ways](#zip).

Apart from these, a jar that [names where other programs keep logins](#secrets) is an alarm, not a level: ender will not install it unless you trust it.

## How the scan works

The scan reads the compiled classes in the jar, and in any jar nested inside it, for the Java calls that grant each capability. It does not run the mod. A class that calls `java.net.http.HttpClient`, for example, is a network finding, and the mod's page lists that class, the call, and the method that makes it, like `HttpClient.send in checkForUpdates`.

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

**What grants it:** `java.net.URL.openConnection`, `openStream` and `getContent`, `java.net.Socket`, `ServerSocket`, `DatagramSocket` and `MulticastSocket`, `java.net.http.HttpClient`, the socket and datagram channels of `java.nio.channels`, `com.sun.net.httpserver.HttpServer`, and Netty's `Bootstrap` and `ServerBootstrap`, which Minecraft provides, so a mod can connect with them and no `java.net` call of its own.

**For its author:** an update checker is the most common network finding, and ender and Modrinth already tell players when a mod has a newer version, so one can often go. Otherwise, [explain it](#for-authors): what the mod connects to, and why.

## Exec

Its code can start other programs on the player's computer.

**Why a mod might:** opening a folder or a link in the system's own app, or running a tool the mod works with, like a video encoder.

**What to look at:** this is the rarest finding and the one with the least room for doubt about what code can do once it has it. Few mods need it, and a content mod almost never does.

**What grants it:** `java.lang.Runtime.exec`, `java.lang.ProcessBuilder`, and `java.awt.Desktop`'s `browse`, `open` and `edit`, which hand a file or a link to whatever program the system picks.

**For its author:** to open a folder or a link, Minecraft's own `Util` does it for you (`Util.getPlatform().openUri` in Mojang's names, `Util.getOperatingSystem().open` in Yarn's), and its code is not part of your jar, so the finding goes away.

## Native

Its code can load a native library: machine code for one system, outside Java altogether.

**Why a mod might:** speed, audio codecs for voice chat, compression, or a library that only exists as native code, like Discord's.

**What to look at:** native code is outside anything the scan can read, so once it loads, the scan cannot say what it does. Prefer mods that ship well-known libraries, and be wary of one that loads a library it downloaded.

**What grants it:** `System.load` and `loadLibrary`, and the same on `Runtime`; Java 22's `java.lang.foreign.Linker` and `SymbolLookup.libraryLookup`, which reach native code with no library loaded the old way; JNA's `Native` and `NativeLibrary`; and LWJGL's `Library.loadNative` and `loadSystem`, which Minecraft provides.

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

**What grants it:** `ClassLoader.defineClass`, `SecureClassLoader.defineClass`, `java.net.URLClassLoader`, `MethodHandles.Lookup.defineClass` and `defineHiddenClass`, and any class extending one of those class loaders; `java.lang.instrument.Instrumentation` and `com.sun.tools.attach.VirtualMachine`, which change classes already loaded or attach to the running game; and `javax.script.ScriptEngineManager`, which runs scripts no scan of the jar reads.

**For its author:** say what the mod defines classes from, and whether any of it comes over the network.

## Hosts

The web addresses named in its code's strings, like `api.modrinth.com`. This is not a capability: a link to the mod's wiki is a host as much as an API is.

**Why a mod might:** links it shows players, an update or skin service it calls, an issue tracker for crash reports.

**What to look at:** alongside a [network](#network) finding, the hosts are the likeliest places it connects to. A host you do not recognize, or one that appears in an update, is worth knowing about.

**For its author:** say which hosts the mod connects to and which are only links it shows.

## Warnings

These are things code can do for a good reason as easily as a bad one. Each is shown as a finding, beside what the code reaches.

### Webhook

Its code names a Discord webhook or a Telegram bot address: a way to post messages into a chat without signing in.

**Why a mod might:** a server mod that relays chat or alerts into its community's Discord.

**What to look at:** a webhook is also how stolen accounts are most often sent away, so on a client mod, or beside a [session](#session) warning, it deserves a clear reason.

### Session

Its code reads Minecraft's session token, the key that lets a program play and join servers as you, or names a launcher's saved accounts file.

**Why a mod might:** an account switcher or a sign-in helper, whose whole job is the session.

**What to look at:** taking the session token is what most Minecraft malware is for. A mod that is not about accounts has no reason to touch it, and one that is should be the one you meant to install.

**What grants it:** `User.getAccessToken` and `getSessionId`, by Minecraft's own names on Minecraft 26 and on NeoForge, by Fabric's names on 1.21 and before, and by Forge's SRG names from 1.17 to 1.20.4 and before 1.17; and strings naming `launcher_accounts.json`.

### Persistence

Its code names a place that starts programs when the computer starts: the Windows Startup folder or Run key, an autostart or systemd user entry on Linux, a LaunchAgent on macOS.

**Why a mod might:** almost never. A launcher or a companion app might.

**What to look at:** this is how fractureiser kept running after the game closed. A mod naming one deserves a reason that says why it needs to outlive the game.

### Clipboard

Its code reads or writes the system clipboard through Java's own toolkit, rather than through Minecraft.

**Why a mod might:** copying coordinates or a share link, or pasting into a text field.

**What to look at:** malware swaps a copied wallet address for its own. Copying is ordinary; reading the clipboard without being asked is not.

### Hidden

The jar holds another jar or a class file under the name of some other kind of file, like `data.bin`.

**Why a mod might:** rarely, a build tool packs things oddly.

**What to look at:** this is how a payload hides from anything that reads only `.class` and `.jar` files. Paired with a [classloading](#classloading) finding, it is worth asking the author about.

### Initializer

Code in a mod's entry point that runs as soon as its class loads, in a static initializer, reaches the network, other programs, native code, or new classes. The entry point is the class its `fabric.mod.json` or `quilt.mod.json` names, or a NeoForge or Forge mod's `@Mod` class.

**Why a mod might:** rarely. Mods do their setup when the loader calls them, not as the class loads.

**What to look at:** this is exactly where fractureiser put its first stage: a few lines added to a mod's main class that fetched the rest the moment the game loaded it. On a mod that never had it, it is the strongest sign in this list short of a secrets alarm.

### Zip

The jar's archive would be read differently by different tools: an entry named twice, or a jar or class present in the file that its directory does not list. The scan reads the directory, as Java does; a tool going through the file entry by entry would find more.

**Why a mod might:** a broken build tool, almost never on purpose.

**What to look at:** an archive built to show one thing to a scanner and another to something else is built to hide.

### Unsourced

Classes in the release's jar that reach the network, other programs, native code, or new classes, and that the repository at that release's tag has no source for, in a package where the rest of the mod's code does have its source. Only mods on GitHub are checked.

**Why a mod might:** its release was built from a branch other than the one tagged, or a class is generated while it builds. Generated classes rarely reach any of these, which is why only those that do are told of.

**What to look at:** a class slipped into a build, rather than written in the repository, is what a compromised build machine or a stolen release account produces. The page lists the classes.

## Secrets

Its code names where other programs keep what lets someone sign in as you: Discord's login token, a browser's saved logins and cookies, a cryptocurrency wallet, Telegram's session, Steam's sign in.

No mod has a reason to name these, which is why this is not a warning but an alarm: shown at the top of the mod's page, in red on its search card, and **ender will not install the jar** unless the command is run again with `--trust`, or, in ender web, its offer to install it anyway is pressed twice; either allows that jar alone, by its hash, so a later build is asked about again.

If you installed a jar with this finding, treat what it names as taken: sign out of Discord everywhere and change your password, change the passwords a browser saved, and move what a wallet holds.

If you are its author and the finding is wrong, [say so in an Explain a finding issue](https://github.com/fatlard1993/ender-index/issues/new?template=explain.yml): it is how the check gets refined.

## Known bad

A jar on the index's known-bad list: one reported and confirmed to do harm, with the reason beside it. Its page says so in red, its search card too, and ender will not install it. The list is [`data/known-bad.json`](https://github.com/fatlard1993/ender-index/blob/main/data/known-bad.json), by each jar's sha256, so a copy of the same jar anywhere in the index is marked the next time the lists are built.

If you installed it, remove it and treat what its finding names as taken. To report a jar, [open a report](https://github.com/fatlard1993/ender-index/issues/new?template=report.yml).

## Unreadable

A class in the jar that the scan could not read. A build tool can write one by mistake; an obfuscator can write one on purpose, since what the scan cannot read, it cannot report. The page lists which.

## Scanner versions

Each jar's findings say which version of the scanner read them. Version 3 added which method makes each call, the [initializer](#initializer) and [zip](#zip) warnings, and Forge's older names for the session token. When the scanner learns a new check, jars read before keep their findings, which are still true; they just were not looked at for the new things. A mod's page offers a rescan for any jar an older scanner read, and anyone can [ask for one](https://github.com/fatlard1993/ender-index/issues/new?template=rescan.yml): its jars are read again within minutes.

## For authors

A finding has two answers.

- **Change the mod** so the code that grants it is gone: drop the dependency that brings it, or use what Minecraft or the loader already does. A setting that turns the code off does not remove the finding, because the scan reads what is in the jar. Once a new release is out, its findings replace the old on your page within the hour.
- **Explain it** in your own words, shown beside the finding on your mod's page: [open an Explain a finding issue](https://github.com/fatlard1993/ender-index/issues/new?template=explain.yml) from your GitHub account. The [authors guide](https://fatlard1993.github.io/ender-index/authors/explaining-a-finding) says who can and how to change it later.

Each finding on your mod's page lists the classes that have it and the calls that grant it, which is where to start looking.
