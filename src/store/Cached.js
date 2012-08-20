(function() {

  // Define the Kinvey.Store.Cached class.
  Kinvey.Store.Cached = Base.extend({
    // Store name.
    name: Kinvey.Store.CACHED,

    // Store options.
    options: {
      policy: null,
      store: { },// AppData store options.

      success: function() { },
      error: function() { },
      complete: function() { }
    },

    /**
     * Creates new cached store.
     * 
     * @name Kinvey.Store.Cached
     * @constructor
     * @param {string} collection Collection.
     * @param {Object} [options] Options.
     */
    constructor: function(collection, options) {
      this.collection = collection;

      // This class bridges between the AppData store and local database.
      this.db = new Database(collection);
      this.store = Kinvey.Store.factory(Kinvey.Store.APPDATA, collection);

      // Options.
      this.options.policy = Kinvey.Store.Cached.NETWORK_FIRST;// Default policy.
      options && this.configure(options);
    },

    /** @lends Kinvey.Store.Cached# */

    /**
     * Aggregates objects from the store.
     * 
     * @param {Object} aggregation Aggregation object.
     * @param {Object} [options] Options.
     */
    aggregate: function(aggregation, options) {
      options = this._options(options);
      this._read('aggregate', aggregation, options);
    },

    /**
     * Configures store.
     * 
     * @param {Object} options
     * @param {string} [options.policy] Cache policy.
     * @param {Object} [options.store] Store options.
     * @param {function(response, info)} [options.success] Success callback.
     * @param {function(error, info)} [options.error] Failure callback.
     * @param {function()} [options.complete] Complete callback.
     */
    configure: function(options) {
      // Store options.
      options.policy && (this.options.policy = options.policy);
      options.store && (this.options.store = options.store);

      // Callback options.
      options.success && (this.options.success = options.success);
      options.error && (this.options.error = options.error);
      options.complete && (this.options.complete = options.complete);
    },

    /**
     * Logs in user.
     * 
     * @param {Object} object
     * @param {Object} [options] Options.
     */
    login: function(object, options) {
      options = this._options(options);
      this.store.login(object, options);
    },

    /**
     * Logs out user.
     * 
     * @param {Object} object
     * @param {Object} [options] Options.
     */
    logout: function(object, options) {
      options = this._options(options);
      this.store.logout(object, options);
    },

    /**
     * Queries the store for a specific object.
     * 
     * @param {string} id Object id.
     * @param {Object} [options] Options.
     */
    query: function(id, options) {
      options = this._options(options);
      this._read('query', id, options);
    },

    /**
     * Queries the store for multiple objects.
     * 
     * @param {Object} query Query object.
     * @param {Object} [options] Options.
     */
    queryWithQuery: function(query, options) {
      options = this._options(options);
      this._read('queryWithQuery', query, options);
    },

    /**
     * Removes object from the store.
     * 
     * @param {Object} object Object to be removed.
     * @param {Object} [options] Options.
     */
    remove: function(object, options) {
      options = this._options(options);
      this._write('remove', object, options);
    },

    /**
     * Removes multiple objects from the store.
     * 
     * @param {Object} query Query object.
     * @param {Object} [options] Options.
     */
    removeWithQuery: function(query, options) {
      options = this._options(options);
      this._write('removeWithQuery', query, options);
    },

    /**
     * Saves object to the store.
     * 
     * @param {Object} object Object to be saved.
     * @param {Object} [options] Options.
     */
    save: function(object, options) {
      options = this._options(options);
      this._write('save', object, options);
    },

    /**
     * Returns full options object.
     * 
     * @private
     * @param {Object} options Options.
     * @return {Object} Options.
     */
    _options: function(options) {
      options || (options = {});

      // Store options.
      options.policy || (options.policy = this.options.policy);
      this.store.configure(options.store || this.options.store);

      // Callback options.
      options.success || (options.success = this.options.success);
      options.error || (options.error = this.options.error);
      options.complete || (options.complete = this.options.complete);

      return options;
    },

    /**
     * Performs read operation, according to the caching policy.
     * 
     * @private
     * @param {string} operation Operation. One of aggregation, query or
     *          queryWithQuery.
     * @param {*} arg Operation argument.
     * @param {Object} options Options.
     */
    _read: function(operation, arg, options) {
      // Extract primary and secondary store from cache policy.
      var networkFirst = this._shouldCallNetworkFirst(options.policy);
      var primaryStore = networkFirst ? this.store : this.db;
      var secondaryStore = networkFirst ? this.db : this.store;

      // Extend success handler to cache network response.
      var invoked = false;
      var fnSuccess = options.success;
      options.success = bind(this, function(response, info) {
        // Determine whether application-level handler should be triggered.
        var secondPass = invoked;
        if(!invoked || this._shouldCallBothCallbacks(options.policy)) {
          invoked = true;
          fnSuccess(response, info);
        }

        // Update cache in the background. This is only part of the complete
        // step.
        if(info.network && this._shouldUpdateCache(options.policy)) {
          var fn = function() { options.complete(); };
          this.db.put(operation, arg, response, { success: fn, error: fn });
        }

        // Trigger complete callback on final pass.
        else if(secondPass || !this._shouldCallBoth(options.policy)) {
          options.complete();
        }
      });

      // Handle according to policy.
      primaryStore[operation](arg, merge(options, {
        success: bind(this, function(response, info) {
          options.success(response, info);

          // Only call secondary store if the policy allows calling both.
          if(this._shouldCallBoth(options.policy)) {
            options.error = function() {// Reset error, we already succeeded.
              options.complete();
            };
            secondaryStore[operation](arg, options);
          }
        }),
        error: bind(this, function(error, info) {
          // Switch to secondary store if the caching policy allows a fallback.
          if(this._shouldCallFallback(options.policy)) {
            var fnError = options.error;
            options.error = function(error, info) {
              fnError(error, info);
              options.complete();
            };
            secondaryStore[operation](arg, options);
          }
          else {// no fallback, error out here.
            options.error(error, info);
            options.complete();
          }
        })
      }));
    },

    /**
     * Returns whether both the local and network store should be used.
     * 
     * @private
     * @param {string} policy Cache policy.
     * @return {boolean}
     */
    _shouldCallBoth: function(policy) {
      var accepted = [Kinvey.Store.Cached.CACHE_FIRST, Kinvey.Store.Cached.BOTH];
      return -1 !== accepted.indexOf(policy);
    },

    /**
     * Returns whether both the local and network success handler should be invoked.
     * 
     * @private
     * @param {string} policy Cache policy.
     * @return {boolean}
     */
    _shouldCallBothCallbacks: function(policy) {
      return Kinvey.Store.Cached.BOTH === policy;
    },

    /**
     * Returns whether another store should be tried on initial failure.
     * 
     * @private
     * @param {string} policy Cache policy.
     * @return {boolean}
     */
    _shouldCallFallback: function(policy) {
      var accepted = [Kinvey.Store.Cached.NETWORK_FIRST];
      return this._shouldCallBoth(policy) || -1 !== accepted.indexOf(policy);
    },

    /**
     * Returns whether network store should be accessed first.
     * 
     * @private
     * @param {string} policy Cache policy.
     * @return {boolean}
     */
    _shouldCallNetworkFirst: function(policy) {
      var accepted = [Kinvey.Store.Cached.NO_CACHE, Kinvey.Store.Cached.NETWORK_FIRST];
      return -1 !== accepted.indexOf(policy);
    },

    /**
     * Returns whether the cache should be updated.
     * 
     * @private
     * @param {string} policy Cache policy.
     * @return {boolean}
     */
    _shouldUpdateCache: function(policy) {
      var accepted = [Kinvey.Store.Cached.CACHE_FIRST, Kinvey.Store.Cached.NETWORK_FIRST, Kinvey.Store.Cached.BOTH];
      return -1 !== accepted.indexOf(policy);
    },

    /**
     * Performs write operation, and handles the response according to the
     * caching policy.
     * 
     * @private
     * @param {string} operation Operation. One of remove, removeWithquery or save.
     * @param {*} arg Operation argument.
     * @param {Object} options Options.
     */
    _write: function(operation, arg, options) {
      // Extend success handler to cache network response.
      var fnError = options.error;
      var fnSuccess = options.success;
      options.success = bind(this, function(response, info) {
        // Trigger application-level handler.
        fnSuccess(response, info);

        // Update cache in the background. This is the only part of the complete
        // step.
        if(this._shouldUpdateCache(options.policy)) {
          // The cache handle defines how the cache is updated. This differs
          // per operation.
          var cacheHandle = {
            remove: ['query', arg, null],
            removeWithQuery: ['queryWithQuery', arg, null]
          };

          // Upon save, store returns the document. Cache this, except for
          // when a user (with password!) is returned.
          if('user' !== this.collection && null != response) {
            cacheHandle.save = ['query', response._id, response];
          }

          // If a cache handle is defined, append the callbacks and trigger.
          if(cacheHandle[operation]) {
            cacheHandle[operation].push({
              success: function() { options.complete(); },
              error: function() { options.complete(); }
            });
            this.db.put.apply(this.db, cacheHandle[operation]);
            return;
          }
        }
        options.complete();
      });
      options.error = function(error, info) {
        // On error, there is nothing we can do except trigger both handlers.
        fnError(error, info);
        options.complete();
      };

      // Perform operation.
      this.store[operation](arg, options);
    }
  }, {
    /** @lends Kinvey.Store.Cached */

    // Cache policies.
    /**
     * No Cache policy. Ignore cache and only use the network.
     * 
     * @constant
     */
    NO_CACHE: 'nocache',

    /**
     * Cache Only policy. Don't use the network.
     * 
     * @constant
     */
    CACHE_ONLY: 'cacheonly',

    /**
     * Cache First policy. Pull from cache if available, otherwise network.
     * 
     * @constant
     */
    CACHE_FIRST: 'cachefirst',

    /**
     * Network first policy. Pull from network if available, otherwise cache.
     * 
     * @constant
     */
    NETWORK_FIRST: 'networkfirst',

    /**
     * Both policy. Pull the cache copy (if it exists), then pull from network.
     * 
     * @constant
     */
    BOTH: 'both'
  });

}());