import { Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpErrorResponse,
  HttpSentEvent,
  HttpHeaderResponse,
  HttpProgressEvent,
  HttpResponse,
  HttpUserEvent,
} from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { mergeMap, catchError } from 'rxjs/operators';
import { NzMessageService } from 'ng-zorro-antd';
import { _HttpClient } from '@delon/theme';
import { environment } from '@env/environment';
import * as moment from 'moment';

/**
 * 默认HTTP拦截器，其注册细节见 `app.module.ts`
 */
@Injectable()
export class DefaultInterceptor implements HttpInterceptor {
  constructor(private injector: Injector) {
  }

  get msg(): NzMessageService {
    return this.injector.get(NzMessageService);
  }

  private goTo(url: string) {
    setTimeout(() => this.injector.get(Router).navigateByUrl(url));
  }

  private handleData(
    event: HttpResponse<any> | HttpErrorResponse,
  ): Observable<any> {

    // 可能会因为 `throw` 导出无法执行 `_HttpClient` 的 `end()` 操作
    this.injector.get(_HttpClient).end();
    // 业务处理：一些通用操作
    switch (event.status) {
      case 200:
        // 业务层级错误处理，以下是假定restful有一套统一输出格式（指不管成功与否都有相应的数据格式）情况下进行处理
        // 例如响应内容：
        //  错误内容：{ status: 1, msg: '非法参数' }
        //  正确内容：{ status: 0, response: {  } }
        // 则以下代码片断可直接适用
        if (event instanceof HttpResponse) {
          const body: any = event.body;
          if (body.code) {
            this.msg.error(body.msg);
            return of(event);
          }
        }
        break;
      case 401: // 未登录状态码
        this.goTo('/passport/login');
        break;
      case 403:
      case 404:
      case 500:
        // this.goTo(`/${event.status}`);
        break;
      default:
        if (event instanceof HttpErrorResponse) {
          console.warn(
            '未可知错误，大部分是由于后端不支持CORS或无效配置引起',
            event,
          );
          this.msg.error(event.message);
        }
        break;
    }
    return of(event);
  }

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<| HttpSentEvent
    | HttpHeaderResponse
    | HttpProgressEvent
    | HttpResponse<any>
    | HttpUserEvent<any>> {
    // 统一加上服务端前缀
    let url = req.url;
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      url = environment.SERVER_URL + url;
    }
    const newReq = req.clone({
      url: url,
    });
    if (newReq.body) {
      this.shiftDates(newReq.body);
    }
    return next.handle(newReq).pipe(
      mergeMap((event: any) => {
        if (event instanceof HttpResponse) {
          // @ts-ignore
          if (newReq.responseType == 'arrayBuffer') {// 若请求时预期的响应类型是arrayBuffer
            let contentType = event.headers.get('Content-Type');// 读取服务端的传递过来的content-type值,服务端需要允许客户端读取该请求头才可以读取成功
            if (contentType && contentType.indexOf('application/json') >= 0) {
              let decoder = new TextDecoder('utf-8');
              let body = JSON.parse(decoder.decode(new Uint8Array(event.body)));// 将二进制值转换为json
              // 创建新的event，并将新的body给新的event对象
              event = event.clone({
                body: body,
              });
            }
          }
        }
        // 允许统一对请求错误处理，这是因为一个请求若是业务上错误的情况下其HTTP请求的状态是200的情况下需要
        if (event instanceof HttpResponse && event.status === 200)
          return this.handleData(event);
        // 若一切都正常，则后续操作
        return of(event);
      }),
      catchError((err: HttpErrorResponse) => this.handleData(err)),
    );
  }

  /**
   * 将实体中的日期类型转换为字符串，以免发送数据被转换为utc格式时间字符串
   * author:王建野
   * @param body
   */
  shiftDates(body) {
    if (body === null || body === undefined) {
      return body;
    }
    if (typeof body !== 'object') {
      return body;
    }
    for (const key of Object.keys(body)) {
      const value = body[key];
      if (value instanceof Date) {
        body[key] = moment(value).format('YYYY-MM-DD HH:mm:ss');
      } else if (typeof value === 'object') {
        this.shiftDates(value);
      }
    }
  }
}
