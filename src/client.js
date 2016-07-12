import { KinveyError } from './errors';
import { getActiveUser, getActiveSocialIdentity } from './utils/storage';
import url from 'url';
import assign from 'lodash/assign';
import isString from 'lodash/isString';
let sharedInstance = null;

/**
 * The Client class stores information about your application on the Kinvey platform. You can create mutiple clients
 * to send requests to different environments on the Kinvey platform.
 */
export class Client {
  /**
   * Creates a new instance of the Client class.
   *
   * @param {Object}    options                             Options
   * @param {string}    [options.protocol='https']          Protocol used for Kinvey API requests
   * @param {string}    [options.host='baas.kinvey.com']    Host used for Kinvey API requests
   * @param {string}    [options.hostname]                  Host name used for Kinvey API requests
   * @param {string}    [options.micProtocol='https']       Protocol used for Kinvey MIC requests
   * @param {string}    [options.micHost='auth.kinvey.com'] Host used for Kinvey MIC requests
   * @param {string}    [options.micHostname]               Host name used for Kinvey MIC requests
   * @param {string}    [options.appKey]                    App Key
   * @param {string}    [options.appSecret]                 App Secret
   * @param {string}    [options.masterSecret]              App Master Secret
   * @param {string}    [options.encryptionKey]             App Encryption Key
   * @param {string}    [options.appVersion]                App version
   *
   * @example
   * var client = new Kinvey.Client({
   *   appKey: '<appKey>',
   *   appSecret: '<appSecret>'
   * });
   */
  constructor(options = {}) {
    options = assign({
      protocol: process.env.KINVEY_API_PROTOCOL || 'https:',
      host: process.env.KINVEY_API_HOST || 'baas.kinvey.com',
      micProtocol: process.env.KINVEY_MIC_PROTOCOL || 'https:',
      micHost: process.env.KINVEY_MIC_HOST || 'auth.kinvey.com',
    }, options);

    if (options.hostname && isString(options.hostname)) {
      const hostnameParsed = url.parse(options.hostname);
      options.protocol = hostnameParsed.protocol;
      options.host = hostnameParsed.host;
    }

    if (options.micHostname && isString(options.micHostname)) {
      const micHostnameParsed = url.parse(options.micHostname);
      options.micProtocol = micHostnameParsed.protocol;
      options.micHost = micHostnameParsed.host;
    }

    /**
     * @type {string}
     */
    this.protocol = options.protocol;

    /**
     * @type {string}
     */
    this.host = options.host;

    /**
     * @type {string}
     */
    this.micProtocol = options.micProtocol;

    /**
     * @type {string}
     */
    this.micHost = options.micHost;

    /**
     * @type {string|undefined}
     */
    this.appKey = options.appKey || options.appId;

    /**
     * @type {string|undefined}
     */
    this.appSecret = options.appSecret;

    /**
     * @type {string|undefined}
     */
    this.masterSecret = options.masterSecret;

    /**
     * @type {string|undefined}
     */
    this.encryptionKey = options.encryptionKey;

    /**
     * @type {string|undefined}
     */
    this.appVersion = options.appVersion;
  }

  get baseUrl() {
    return url.format({
      protocol: this.protocol,
      host: this.host
    });
  }

  get activeUser() {
    return getActiveUser(this);
  }

  get activeSocialIdentity() {
    return getActiveSocialIdentity(this);
  }

  get appVersion() {
    return this.clientAppVersion;
  }

  set appVersion(appVersion) {
    if (appVersion && !isString(appVersion)) {
      appVersion = String(appVersion);
    }

    this.clientAppVersion = appVersion;
  }

  /**
   * Returns an object containing all the information for this Client.
   *
   * @return {Object} JSON
   */
  toJSON() {
    const json = {
      protocol: this.protocol,
      host: this.host,
      micProtocol: this.micProtocol,
      micHost: this.micHost,
      appKey: this.appKey,
      appSecret: this.appSecret,
      masterSecret: this.masterSecret,
      encryptionKey: this.encryptionKey,
      appVersion: this.appVersion
    };

    return json;
  }

  /**
   * Initializes the library by creating a new instance of the
   * Client class and storing it as a shared instance.
   *
   * @param {Object}    options                             Options
   * @param {string}    [options.protocol='https']          Protocl used for requests
   * @param {string}    [options.host='baas.kinvey.com']    Host used for requests
   * @param {string}    options.appKey                      App Key
   * @param {string}    [options.appSecret]                 App Secret
   * @param {string}    [options.masterSecret]              App Master Secret
   * @param {string}    [options.encryptionKey]             App Encryption Key
   *
   * @throws {KinveyError}  If an `options.appKey` is not provided.
   * @throws {KinveyError}  If neither an `options.appSecret` or `options.masterSecret` is provided.
   *
   * @return {Client}  An instance of Client.
   *
   * @example
   * var client = Kinvey.Client.init({
   *   appKey: '<appKey>',
   *   appSecret: '<appSecret>'
   * });
   */
  static init(options) {
    const client = new Client(options);
    sharedInstance = client;
    return client;
  }

  /**
   * Returns the shared client instance used by the library.
   *
   * @throws {KinveyError} If `Kinvey.init()` has not been called.
   *
   * @return {Client} The shared instance.
   */
  static sharedInstance() {
    if (!sharedInstance) {
      throw new KinveyError('You have not initialized the library. ' +
        'Please call Kinvey.init() to initialize the library.');
    }

    return sharedInstance;
  }
}
