import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

import VeSyncFan from './VeSyncFan';

export enum BypassMethod {
  STATUS = 'getPurifierStatus',
  SWITCH = 'setSwitch',
  NIGHT = 'setNightLight',
  SPEED = 'setLevel',
  MODE = 'setPurifierMode',
  DISPLAY = 'setDisplay',
  LOCK = 'setChildLock'
}

export default class VeSync {
  private api?: AxiosInstance;
  private accountId?: string;
  private token?: string;

  private readonly AGENT = 'VeSync/VeSync 3.0.51(F5321;Android 8.0.0)';
  private readonly DEVICE_TYPES = ['Core300S', 'Core400S'];
  private readonly TIMEZONE = 'America/New_York';
  private readonly OS = 'HomeBridge-VeSync';
  private readonly VERSION = '1.0.0';
  private readonly LANG = 'en';

  private readonly AXIOS_OPTIONS = {
    baseURL: 'https://smartapi.vesync.com',
    timeout: 15000
  };

  constructor(
    private readonly email: string,
    private readonly password: string
  ) {}

  private generateDetailBody() {
    return {
      appVersion: this.VERSION,
      phoneBrand: this.OS,
      traceId: Date.now(),
      phoneOS: this.OS
    };
  }

  private generateBody(includeAuth: boolean = false) {
    return {
      acceptLanguage: this.LANG,
      timeZone: this.TIMEZONE,
      ...(includeAuth
        ? {
            accountID: this.accountId,
            token: this.token
          }
        : {})
    };
  }

  private generateV2Body(fan: VeSyncFan, method: BypassMethod, data: any = {}) {
    return {
      method: 'bypassV2',
      debugMode: false,
      deviceRegion: fan.region,
      cid: fan.cid,
      configModule: fan.configModule,
      payload: {
        data: {
          ...data
        },
        method,
        source: 'APP'
      }
    };
  }

  public async sendCommand(
    fan: VeSyncFan,
    method: BypassMethod,
    body: any = {}
  ): Promise<boolean> {
    if (!this.api) {
      throw new Error('The user is not logged in!');
    }

    const response = await this.api.put('cloud/v2/deviceManaged/bypassV2', {
      ...this.generateV2Body(fan, method, body),
      ...this.generateDetailBody(),
      ...this.generateBody(true)
    });

    return response.data.code === 0;
  }

  public async getDeviceInfo(fan: VeSyncFan): Promise<any> {
    if (!this.api) {
      throw new Error('The user is not logged in!');
    }

    const response = await this.api.post('cloud/v2/deviceManaged/bypassV2', {
      ...this.generateV2Body(fan, BypassMethod.STATUS),
      ...this.generateDetailBody(),
      ...this.generateBody(true)
    });

    return response.data;
  }

  public async login(): Promise<boolean> {
    if (!this.email || !this.password) {
      throw new Error('Email and password are required');
    }

    const pwdHashed = crypto
      .createHash('md5')
      .update(this.password)
      .digest('hex');

    const response = await axios.post(
      'cloud/v1/user/login',
      {
        email: this.email,
        password: pwdHashed,
        devToken: '',
        userType: 1,
        method: 'login',
        token: '',
        ...this.generateDetailBody(),
        ...this.generateBody()
      },
      {
        ...this.AXIOS_OPTIONS
      }
    );

    if (!response?.data) {
      return false;
    }

    const { result } = response.data;
    const { token, accountID } = result ?? {};

    if (!token || !accountID) {
      return false;
    }

    this.accountId = accountID;
    this.token = token;

    this.api = axios.create({
      ...this.AXIOS_OPTIONS,
      headers: {
        'accept-language': this.LANG,
        accountid: this.accountId!,
        appversion: this.VERSION,
        'content-type': 'application/json',
        tk: this.token!,
        tz: this.TIMEZONE,
        'user-agent': this.AGENT
      }
    });

    return true;
  }

  public async getDevices(): Promise<VeSyncFan[]> {
    if (!this.api) {
      throw new Error('The user is not logged in!');
    }

    const response = await this.api.post('cloud/v2/deviceManaged/devices', {
      method: 'devices',
      pageNo: 1,
      pageSize: 1000,
      ...this.generateDetailBody(),
      ...this.generateBody(true)
    });

    const { result } = response.data;
    const { list } = result ?? { list: [] };

    const devices = list
      .filter(({ deviceType }) => this.DEVICE_TYPES.includes(deviceType))
      .map(VeSyncFan.fromResponse(this));

    return devices;
  }
}