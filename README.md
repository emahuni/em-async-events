# em-async-events

[![npm](https://img.shields.io/npm/v/em-async-events.svg)](em-async-events) ![npm](https://img.shields.io/npm/dt/em-async-events.svg)

Easier and more useful event bus with features that include expirable, lingering and catch-up async events and
listeners, and a customizable atomic API. Has a Vue plugin.

## Features

- **stoppable events and listeners**; stop an event from firing on other callbacks when it hits a specific callback or
  on the first callback
- **automated event management:**
    - auto-removal of listeners on destruction.
    - expirable listeners that listen for a specified time before they are removed.
- **async events** that get responses from listeners. Returns Bluebird 3 promise.
- **async listeners** that can wait for callback(s) to fire the first time before proceeding. Returns Bluebird 3
  promise.
- **lingering events;** these are events that are fired and used by current listeners, but wait for newer listeners
  until a specified time before being discarded or wait until its listener is added (bait mode).
- **multiple callbacks and events registrations:**
    - handle multiple events with one callback.
    - invoke/fire multiple callbacks from multiple events.
    - register these using atomic statements.
- **you can use it *without* of Vue!**
- **excellent debugging and logging support**: trace and debug everything to quickly see what's going on. Tip: it's so
  useful to turn on `debug.all` option during development.

## Installation

Installation is simple:

```bash
yarn add em-async-events
# or using npm
npm install em-async-events
```

## Basic Usage

Straight usage without Vue:

```javascript
import AsyncEvents from 'em-async-events';

const eventsBus = new AsyncEvents();
// you then use it as 
eventsBus.onEvent('foo', (payload) => {/* do something */});
// ... later on
eventsBus.emitEvent('foo', { bar: 'zoo' });
```

As a Vue plugin:

```javascript
import Vue from 'vue';
import AsyncEvents from 'em-async-events';

Vue.use(new AsyncEvents());
// you then use in components as 
this.$onEvent('foo', (payload) => {/* do something */});
// ... later on
this.$emitEvent('foo', { bar: 'zoo' });
```

As you can see, everything works the same way whether with or without Vue except for a few differences where components
are at play, read on.

## Events management

This package aims to address the above features and avoid some thorny issues that other event buses have. It was once
called `vue-hooked-em-async-events` because it mainly focused on **Vue**, but it was so good at solving many common
event problems that the author decided to make it work without Vue and created `em-async-events`.

## Methods

There are several methods used to manage events with super duper conveniences like async events/listeners/callbacks.
Examples are going to be given in Vue syntax, but you can adopt to any object you attach this to, such as `events`
object in the initialization example above. Just replace the `this.$` like so: `this.$onEvent` to `events.onEvent`.

### Listening to events:

Listening to event or events:

- most options can be mixed to get the desired behaviour
- callback arguments: `payload` and listener `options` (used to add the listener)

#### onEvent() and onceEvent()

run callback on event emission.

```js
  this.$onEvent('some-event', eventCallback);

function eventCallback1 (payload, metadata) {
  return /* whatever response you want to return to the event; see below */
}
```

##### metadata

`metadata` is information about the event and the listener itself passed to the callback function as the second
argument, eg:

```js
metadata == {
  extra:        'extra payload (not event related) from listener adding line. see below',
  eventMeta:    {
    payloads:        [/* array of all previous event callbacks' outcomes (if there're multiple listeners), see below */],
    eventName:       "some-event",
    eventOptions:    {/*opts passed to event*/ },
    listenerOptions: {/*opts passed to listener*/ },
    eventOrigin:     VueComponent /*vue compo that emitted the event when applicable */,
    listenersTally:  6 // number of listeners for this event
  },
  listenerMeta: {
    // ... todo document both when stable
  }
};
```

##### extra information to callback

Send extra info to a callback from emission side.

- callback should extract extra info from the second argument.

```js
  this.$onEvent('some-event', eventCallbackExtra, { extra: { blah: 'bloh' } });

async function eventCallbackExtra (payload, { extra }) {
  // metadata can contain extra payload that comes from where listener was defined if specified, see above. Allows for a more cleaner and interesting API
  // - passed to every event callback of that listener
}
```

##### Listen once and remove

```js
  this.$onceEvent('some-event', eventCallback2);
this.$onEvent('some-event', eventCallback1, { once: true });

async function eventCallback1 (payload) {
  // you can ignore metadata
  return /* whatever response you want to return to the event; see below */
}

async function eventCallback2 (payload, metadata) {
  return { blah: 'any new payload of any type for this callback to pass back' };
  // you can get reponses from all callbacks in metadata.payloads[]
}

```

##### Exclusive listener support

###### Relative to component

Only allow this listener for this event on this component (any subsequent listeners are ignored)

```js
  this.$onEvent('some-event', eventCallback1, { isLocallyExclusive: true });
// or just replace any existing exclusive listener 
this.$onEvent('some-event', eventCallback1, { isLocallyExclusive: true, replaceExclusive: true });
```

###### globally

Only allow this listener for this event globally (any subsequent listeners are ignored).

- this means that no listener of that name can be registered globally.

```js
  this.$onEvent('some-event', eventCallback1, { isGloballyExclusive: true });
// or just replace any existing exclusive listener 
this.$onEvent('some-event', eventCallback1, { isGloballyExclusive: true, replaceExclusive: true });
```

##### Async listener registration

Only continue after event has been used by callback using async nature of lib.

- This is particularly useful for putting up code that doesn't execute as long as a certain event has not yet happened,
  as well as use the usual callbacks approach. Any further events will be handled by callback(s).
- ~~isAsync~~ option was deprecated and no longer required as all events and listeners are now async by default

```js
  let result = await this.$onceEvent('some-event', (payload, metadata) => {
  return 'whatever else as the final payload';
});

// the above statement will wait for and give out result from callbacks

result = await this.$onceEvent('some-event');
// will wait again for the event to happen without any callbacks associated with it
```

##### Expiring listeners

```js
  // automatically stop listening after 5000 milliseconds
this.$onEvent('some-event', eventCallback3, { expire: 5000 });
// automatically run expiry callback function before unlistening after 10000 milliseconds 
this.$onEvent('some-event', eventCallback3, {
  expire: 10000, expiryCallback: async () => {
    // do something when event listener expires
  }
});


function eventCallback3 (payload, metadata) {
  // you can also change how the event will behave by modifying the listenerOptions
  // - not all options are modifiable
  // eg: stop invoking any subsequent callbacks on the event
  metadata.listenerOptions.stopHere = true;
}
  ```

##### Serial callbacks

Run a single instance of the associated callback(s) at a time. It means callbacks will wait for each other to complete
before even starting. They don't pass outcomes to each here, they are just independent calls.

- useful if you don't want to have certain data modified by multiple calls at the same time or something happening at
  the same time using the same callback function.

```js
this.$onEvent('some-event', eventCallback3, { callbacks: { serialExecution: true } });
this.$emitEvent('some-event', 'payload');
this.$emitEvent('some-event', 'payload1');
this.$emitEvent('some-event', 'payload2');
```

eventCallback3 will be executed in a serial fashion, waiting for each callback to complete before invoking the next
event's callback instance.

##### Atomic listener API:

- multiple events being listened to and handled by one callback
- multiple events being listened to and handled by multiple callbacks

```js 
 this.$onEvent(['second-event', 'third-event'], (payload) => {/*...*/});
// fire multiple callbacks 
this.$onEvent('some-other-event', [eventCallback, eventCallback2, (payload) => {/*...*/}]);
// (even for multiple events)
this.$onEvent(['second-event', 'third-event', 'fourth-event'], [eventCallback1, eventCallback2]);

function eventCallback (payload) {
  // payload is data given at initial event emission. If chain is true in eventOptions, then
  // payload is the data being passed by the event or from previous callback listener in the chain of callbacks
  // for the event. EG: if this callback returns then the response is the next callback's payload.
}


async function eventCallback1 (payload, metadata) {
  return /* whatever response you want to return to the event; see below */
}

const eventCallback2 = eventCallback1;

function eventCallback3 (payload, metadata) {
  // you can also change how the event will behave by modifying the listenerOptions
  // - not all options are modifiable
  // eg: stop invoking any subsequent callbacks on the event
  metadata.listenerOptions.stopHere = true;
}
```

### Emitting events:

Emitting events is simple, but this package takes it to another level of usability with async events, which are promises
returned by eventEmiters for finer flow control on events as they happen and how they are listened and responded to.

- most options can be mixed to get the desired behaviour

```js
    // send payload/data to listeners of 'some-event'
this.$emitEvent('some-event', { test: 'one' });
```

#### Use lingered events

Why use linger? bust race conditions. it doesn't matter how your order your events and listeners when using this it will
make sure that events can fire and wait for listeners to pop in within a certain timespan.

- Each event is actually lingered `500`ms by default. See `eventsOptions.linger` in options below.
- To Disable lingering on a specific event, set `linger: false` on event options when emitting. Figures < 0 or falsy
  will cause the default options `eventsOptions.linger` time to be applied. And if falsy also, it will disable lingering
  altogether.
- You can regulate each listener's linger catching up using `catchUp` time on listeners' options.
- ~~globalLinger~~ - was deprecated in favour of using the default options' `eventsOptions.linger` option.

eg: Linger for 5000ms for new listeners of the event.

```js
    this.$emitEvent('some-event3', { test: 'one' }, { linger: 5000 });
```

##### CatchUp

To adjust how long a listener can catch up to an event use `catchUp` time defined in listener options.

- the max value is the value of default options `eventsOptions.linger`. Change the default option if needed; see below
- the event doesn't have to be a lingered event coz every event is lingered by default.
- if `catchUp` is falsy, then the listener won't catch up to any lingering event at all.

For example to catch up an event that happened not more than 100 milliseconds ago (without using `linger` option when
emitting the event):

```js
  this.$onEvent('some-event', (payload) => {/*...*/}, { catchUp: 100 });
 ``` 

For example to NOT catch up an event at all (if we missed the event don't use the lingered one):

```js
  this.$onEvent('some-event', (payload) => {/*...*/}, { catchUp: 0 });
 ```

##### Exclusive events

When an event is lingered and `isGloballyExclusive: true`, newer events will will be ignored until the lingered event
expires, unless `replaceExclusive: true`, which will replace the exclusive event with a fresh one. eg:
exclusively linger this event; no other events of the same event name ('some-event5') will be lingered until after
5000ms

```js
    this.$emitEvent('some-event5', { test: 'one' }, { linger: 5000, isGloballyExclusive: true });

// hint: this creates an event based state updated by emissions and read by listeners
//  - may actually create an easy API around this ;D
```

##### Baited events

Setting the `bait: true` option will cause the event to linger forever until consumed by a listener.

- A baited listener will not linger at all if consumed. Meaning, if there were listeners of that event when you try to
  bait, it will just invoke associated callbacks and expire immediately.

```js
// If no listeners were listening when this was requested then it lingers waiting for one to listen and expires as soon as it is listened to.
this.$emitEvent('some-event', { test: 'one' }, { bait: true });
```

#### Event Range (Vue specific)

Event range options offer precise control over which listeners are invoked. You target them using tokens based on the
hierarchic position/level of component that emits the event (event origin).

why? EG: Consider the following components hierachy all listening to the same event:
`grandparent=>parent=>child=>grandchild=>greatGrandchild`
if event was fired at grandchild then all listeners from parent to grandparent will handle event.

Options are separated by a hyphen and constructed from the following tokens (eg: `parent-descendents` will invoke the
parent and any descendents):

- `self`: will only invoke listeners in event origin (component that fired the event). Every other token will begin from
  origin as well.
- `child` or `children`: will invoke listeners that are below event, whether they are direct descendents of event origin
  or not. Note, this won't go all the way down, just the next level only.
- `descendent` or `descendents`: will invoke listeners that are below origin, whether they are direct descendents of
  event origin or not. Note, this will invoke up to the last-most-bottom listener.
- `child` or `children`: will invoke listeners that are below event, whether they are direct descendents of event origin
  or not. Note, this won't go all the way down, just the next level only.
- `descendent` or `descendents`: will invoke listeners that are below origin, whether they are direct descendents of
  event origin or not. Note, this will invoke up to the last-most-bottom listener.
- same goes for `ancestors` or `parent`... but in the opposite direction.
- `broadcast` - invokes every listener listening for event regardless of location.

By level we mean the following. Consider there is a listener where there is an 👂🏽:

(todo need to use graphics here and cleanup docs)

compo0👂🏽=>compo1👂🏽=>compo2👂🏽=>compo3=>compo4=>compo5(origin)=>compo6=>compo7👂🏽=>compo8👂🏽=>compo9=>compo10👂🏽

sib0👂🏽=>sib👂🏽=>sib2👂🏽=>sib3=>sib4=>sib5(sibling)=>sib6=>sib7👂🏽=>sib8👂🏽=>sib9

Relative to origin, where event is emitted:

- compo2 is level -1 and is `parent`(for the first one only) or `parents` (for all components on the same level but in
  other hierarchies.
- compo1 is level -2 and is `ancestor` (for the first one only)  or `ancestors` (see above explanation), but including
  all the way up to any listeners before it eg: compo0.
- compo7 is level 1 and is `child` (for the first one only) or `children` (for all components on the same level but in
  other hierarchies.
- compo8 is level 2 and is `descendent` (for the first one only)  or `descendents` (see children explanation), but
  including all the way down to any listeners after it eg: compo10.

##### Range Examples:

Fire event callbacks of a specific range (default is `first-parent`)

```js
    this.$emitEvent('some-event2', { test: 'one' }, { range: 'ancestors' });
```

Stop on the first listener callback (guaranteeing event is handled only once, by the immediate parent listener)

```js
    this.$emitEvent('some-event2', { test: 'one' }, { range: 'first-parent' });
```

Use the other above-listed tokens to achieve required results.

### Remove Event Listeners

Removing event from events object for all listeners (example):

```javascript
export default {
  methods: {
    dontWannaListenAnymore () {
      this.$eraseEvent('some-event'); // now no component will listen to this event
      this.$eraseEvent(['second-event', 'third-event']);
    }
  }
}
```

### Remove Events manually (example):

```javascript
export default {
  methods: {
    leaveMeAlone () {
      // nice, but it is also done automatically inside "beforeDestroy" hook
      this.$fallSilent();
    }
  }
}
```

### Remove specific callback for specific event (example):

```javascript
export default {
  methods: {
    leaveMeWithoutSpecificCallback () {
      this.$fallSilent('some-event', this.specificCallback);
    }
  }
}
```

### Remove array of callbacks for specific event (example):

```js
export default {
  methods: {
    leaveMeWithoutSpecificCallbacks () {
      this.$fallSilent('some-event', [this.callbackOne, this.callbackTwo]);
    }
  }
}
```

### Unsubscribe component from specific event or events

- all component's callbacks for these events will be removed:

```js
export default {
  methods: {
    notListenToOne () {
      this.$fallSilent('some-event');
    },
    notListenToMany () {
      this.$fallSilent(['some-event', 'another-event']);
    }
  }
}
```

### Utilities

There are several methods for doing other things.

```javascript
// will return true if there is any listener with either ids: "event-id-1" or "event-id-2"
this.$hasListeners(['event-id-1', 'event-id-2']);
// will return true if there is a listener with event id: "event-id-1"
this.$hasListener('event-id-1');
// will return true if there is any lingering events with either ids: "event-id-1" or "event-id-2"
this.$hasLingeringEvents(['event-id-1', 'event-id-2']);
// will return true if there is any lingering events with event id: "event-id-1"
this.$hasLingeringEvent('event-id-1'); 
```

### Customization

- renaming functions:
    - If you use some plugins, which have some conflicting function names (or you just don't like default ones), you can
      rename all of them according to your preferences. NOTE: use this feature at your own risk as it will warn you only
      for Vue basic properties.
- default callback and event options

```
    "$options", "$parent", "$root", "$children", "$refs", "$vnode", "$slots", "$scopedSlots", "$createElement", "$attrs", "$listeners", "$el"
```

```javascript
    import Vue from 'vue';
import AsyncEvents from 'em-async-events';

Vue.use(new AsyncEvents({
  onEvent:    '$hear',
  onceEvent:  '$hearOnce',
  emitEvent:  '$fireEvent',
  eraseEvent: '$deleteEvent',
  fallSilent: '$noMore',
  
  listenersOptions: { stopHere: true, /*...*/ },
  eventsOptions:    { range: 'ancestors', /*...*/ },
  
  // debugging options, useful when you want to see what's going on. below are the defaults
  debug: {
    all:                    false, // toggles all debugging, but Vue.config.devtools option, which is usually true at development, turns it to false if it is false.
    addListener:            true, // show add listener debug messages
    invokeListener:         true, // show debug messages when listener is invoked
    emitEvent:              true, // show emit events debug messages
    eraseEvent:             true, // show erase event listeners debug messages
    lingerEvent:            true, // show linger events debug messages
    chainListenerCallbacks: true, // show chainListenerCallbacks debug messages
    removeListener:         true  // show remove listener debug messages
  }

}));

export default {
  // later in component...
  created () {
    this.$hear('some-event', this.callbackMethod);
    
    // you can also change options in userland
    this.$asyncEvents.options.debug.all = true;
    
    // or change it per event or listener or all those debug options listed above; 
    // use trace option and...
    // add verbose to show actual code trace info (very useful to figure out what code is emitting event)
    this.$hear('some-event', () => { /*do something */ }, { trace: true, verbose: true });
  },
  methods: {
    doSmth () {
      this.$fireEvent('some-event', 'payload', { trace: true });
    },
    unsubscribe () {
      this.$noMore('some-event');
    }
  }
}
```

### Default options

Default options that you don't have to set all the time or that control certain things.

```js
defaultOptions === {
  listenersOptions: {
    extra:               undefined,
    callbacks:           {
      serialExecution:     false,
      debounce:            null, // lodash debounce opts; {wait, leading, trailing, maxWait}
      throttle:            null, // lodash throttle opts; {wait, leading, trailing}
      isLocallyExclusive:  false,
      isGloballyExclusive: false,
      replaceExclusive:    false,
    },
    stopHere:            false,
    expire:              0,
    expiryCallback:      undefined,
    catchUp:             100,
    once:                false,
    isLocallyExclusive:  false,
    isGloballyExclusive: false,
    replaceExclusive:    false,
    trace:               false,
    verbose:             false,
  },
  eventsOptions:    {
    chain:               false,
    linger:              500,
    bait:                false,
    isLocallyExclusive:  false,
    isGloballyExclusive: false,
    replaceExclusive:    false,
    range:               'first-parent',
    trace:               false,
    verbose:             false,
    rejectUnconsumed:    false,
  },
  
  maxCachedPayloads: 5,
  
  debug: {
    all:                    true,
    addListener:            false,
    emitEvent:              false,
    eraseEvent:             false,
    invokeListener:         false,
    lingerEvent:            false,
    chainListenerCallbacks: false,
    removeListener:         false,
  },
}
```

## Author

Emmanuel Mahuni
