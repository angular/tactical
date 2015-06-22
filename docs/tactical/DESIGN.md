# Tactical

## User Goals

- Users can navigate, interact with, and make changes in the application while network connectivity is intermittent or absent.
- Promote consistency of data throughout the application as mutations are made.
- Leverage a local data store to reduce the latency of fetch and mutation operations and improve the user experience while weakly connected.

## Practical Obstacles to User Goals

- Retrofitting offline support into an existing application.
- Leveraging native APIs that have no standard practices or conventions and are difficult to test.
- Merging data from different services into a unified model.
- Progressively updating local cache in order reduce HTTP overhead while also trying to prevent the cache from going stale.
- Knowing what information is needed to empower the user to resolve complications when they occur.
- Synchronizing the offline history of a single user after an indefinite amount of time offline.
- Synchronizing changes from multiple users and informing those users of the result.
- Choosing when and in what order to perform fetch and sync operations in order to provide the best user experience.
- Deciding which data to cache when facing weak connections and possible limitations of space.
- Balancing security/privacy and usability of cached data.
- Achieving a desirable user experience when faced with the reality of weak and absent connections.

## Constraints and Assumptions

- Tactical is designed to be incrementally integrated — alongside an existing model — into any application, but will ship with additional features for Angular 2 applications.
- The core library will provide support for both JavaScript and Dart in the browser and on the server.
- Applications will target browsers with HTML5 storage APIs.
- Backend services are capable of providing — using such techniques as websockets or polling — an open dialogue with the client.
- Backend services can support a versioning system capable of validating changes to the model.

## Design

### Data Model

In order to allow end users to be able to interact with their application — even while weakly connected — Tactical provides a local representation of the data model for the application to work with.

To build up this local representation, Tactical has specifications that backend services must meet. In order to make Tactical more adaptable, its specifications only require that backend services be capable of supplying their objects in JSON format. The structure of the JSON is up to each consumer to decide for their respective application. Tactical does not inspect the internal properties of JSON data and will retain any particular order inside the structure.

Once supplied, Tactical will store the received JSON objects in persistent browser storage using JSON objects as keys. Keys are provided by the application when it makes calls to Tactical. Each key should be able to uniquely describe the object that’s associated with it. The representation of a key is up to the application, but can be as simple as a JSON representation of a standard HTTP request body. Tactical will handle translating each key to a unique token that can be used to index the key’s respective value.

However, for some applications, this local representation will not be complete. By registering tactics, consumers will have the ability to easily specify what data would provide a more usable offline data model. From there, Tactical will handle prudently making the appropriate calls in order to eagerly prepare the offline model — reducing application latency in the process.

### Data Manager

Providing this experience requires that Tactical manage three separate representations of the application model: the complete data model _(which is managed by the backend)_, a partial data model _(which is managed by Tactical)_, and changes to the model _(which are managed by the end user)_. Mediating these three representations — in a way that both respects all expectations of the general model and achieves a desirable user experience — will be the most difficult challenge for this library.

As a first step towards solving this challenge, Tactical provides a Data Manager. The Tactical Data Manager will be responsible for:

1. Prudently loading data from the backend in order to build a better local model for the application to use.
2. Reducing latency by supplying the application with cached data, and refreshing the cache when that data becomes too stale to be usable.
3. Emitting data to the application when new versions are received from the backend or local store.
4. Informing the application when mutations cannot be successfully applied to the local store or on the backend.
5. Managing open obserables held by the application and forgetting them once they are closed.
6. Maintaining an evolving local model when the application has intermittent or no connectivity, and synchronizing that model with the backend whenever a connection is reestablished.

When the situation arises that the application is too complex for the Data Manager to meet its responsibilities on its own, tactics can be used to supply the Data Manager with the assistance that it requires. Also, tactics can be used to override the Data Manager’s default behavior if the application needs to take a different approach than what this library had originally intended.

### Store

The second most important component of Tactical is its Store. The Tactical Store is responsible for:

1. Storing and maintaining cached data _(which includes cacheable objects and local mutations)_ in persistent browser storage.
2. Maintaining a versioning system for cacheable objects.
3. Emitting mutated objects when mutations can be applied without conflict, or otherwise emitting mutations when no conflict-free approach can be found.

The Tactical Store is an abstraction upon browser storage APIs. This store provides the means to maintain persistent application data and provides a number of synchronization methods for handling multiple access points on the same browser. 

One of the most difficult challenges is managing competing access points. Access points compete whenever multiple access points attempt to mutate _(“alter”)_ the same object. To handle this scenario, the Tactical Store implements its own versioning system. Versions are indicative of the progression that an object has undergone inside of Tactical. This includes all mutations: whether the object has gained or lost properties, or if any of those properties have been changed. Every object requested from the Tactical Store will be returned with its respective version, and it is intended that the application will not directly alter the version.

### Mediating Mutations

When the application needs to mutate the state of objects in the Tactical Store, the application can supply Tactical with a JSON representation of the mutated object. The Tactical Store will then persist all mutations on that object and also determine if those mutations can be applied to the object Tactical has stored in browser. This methodology becomes very important when we, once more, consider competing access points.

With competing access points, Tactical can receive multiple mutations to the same version of an object. If this were to occur, the first mutation received will alter the state — thus indirectly altering the version — of the object Tactical has stored. Therefore making all further mutations applicable only to an older version of the object causing further mutations to be rejected for that reason. If a mutation is ever rejected, the mutation and the newest version of the target object will be emitted — through an observable — to the application so that consumers can decide how rejected mutations will be handled in their respective application.

### Tactics

Tactics, after which the library is named, are a means of embedding application specific login into Tactical. This knowledge can be used to:
Resolve queries not cached explicitly in local store.
Propagate mutations across object relationships.
Prefetch additional data to build a better local store.

To assist with this process, Tactical exposes a much larger API for use inside of tactics. Through this API, tactics will have the opportunity to hook into any of the components that Tactical employs and will have access to much more of the local model. This will make it easier for consumers to write tactics that will interface with Tactical while still preventing them from rewriting Tactical in order to achieve their goals.

## Why Tactical?

Two other popular options that can be used to solve similar challenges are that of Firebase and Falcor.

### Firebase

Firebase is a cloud-based backend platform that focuses on solving many of the challenges that arise with having a large user base such as authentication and data synchronization. They also announced at Google I/O that they are currently working towards providing a persistent offline model for their consumers to use.

The two main differences between Firebase and Tactical are the expectations we place on the backend model and our approach to data synchronization. Firebase is a backend platform. Their expectation is that, for any application, they will provide all of the backend support that is required. For new applications, Firebase is a great way to move forward quickly with all of the backend support that most applications would ever need. However, for applications that are already in place, using Firebase often means moving all backend services to their platform. Tactical is designed to be integrated alongside an existing data model. Tactical specifications require the ability to handle and compare JSON objects — something that most modern web backends already support.

Second, Firebase’s approach to data synchronization is that the last received request always wins. This means that if multiple users are trying to change the same object, then the last user to submit their change will overwrite all of the previous changes. Tactical takes the opposite approach. Using versioning, Tactical only accepts changes to the version that it has in store. Therefore, when multiple requests attempt to change the same version of an object, only the first request will be accepted. All further requests will be rejected and then Tactical will inform the application of the rejection so that it can resolve the request in a manner it deems the most appropriate. In most cases, the resolution will only require a merge to "rebase" the rejected mutation on top of the new version of the object.

### Falcor

Falcor is a library that provides consumers with the convenience of always being able to work with a JSON model, regardless of where that model is located. However, this design requires that applications either always be online or work off a non-persistent local cache. Since its cache is non-persistent, applications can suffer when they are intentionally closed or when they unexpectedly crash. Tactical persists all data that it collects over the application’s lifecycle, whether that data be objects or mutations made by the application or end user. This way, regardless of what happens to the application, end users can have a consistent experience.

Falcor’s caching model also helps reduce application latency and can be built up over time to help service a wider range of use cases. This can be very problematic for applications that wish to cache a large amount of data or for cases when the application doesn’t have a stable connection.  Tactical provides a number of utilities to allow applications to specify what data they need to have an offline model that their users will enjoy. From there, Tactical handles fetching data from the backend in a manner that won’t slow down the application and at times that are optimal for both the stability of the connection and the bandwidth that it can service.

Using its JSON graph, consumers can also implement and use a data model that guarantees consistency throughout the application. This requires that backends be able to conform their response data to the same specifications of a JSON graph. Tactical provides the ability to create tactics which can be used to embed application specific logic into Tactical. With tactics, consumers can specify how they want their data to be represented browser side to ensure a consistent representation of data.
