---
categories: 基础架构
tags:
  - RPC
  - 后端
description: ''
permalink: ''
title: 手搓RPC框架
cover: /images/ab6231a3d2f775538d50989cdb1f8a9d.png
date: '2025-01-01 17:42:00'
updated: '2025-01-01 18:38:00'
---

> 😠 天天在SpringBoot的庇护下写CRUD，多没意思


> 什么是RPC？远程过程调用（Remote Procedure Call），是一种计算机通信协议，它允许程序在不同的计算机之间交互通信，以实现本地调用的效果。


随着业务功能模块增多，单体架构已经不能满足要求，分布式系统、微服务框架大行其道，这就产生了将不同模块拆分到不同服务器上运行的需求。拆分虽好，但是模块之间通信的问题接踵而来。


在SpringBoot、SpringCloud等重量级框架的庇护下，我们在普通的业务逻辑开发中很难意识到RPC的存在，它在背后默默发挥着重要作用。RPC框架允许我们像调用本地方法一样调用其他模块的接口，而不需要了解数据的传输处理过程、底层网络通信的细节。如果没有RPC，两个系统之间的通信将只能手动构造发送请求，异常繁琐，耗时耗力。


> 👏 **想不想揭开RPC神秘的面纱？请看下文**


# 基本架构

- 底层使用Vertx框架
- 采用Http协议传输
- 使用JDK动态代理实现代理服务类
- 使用JDK序列化器
- 本地服务注册

## 框架结构


![Untitled.png](/images/d2b6b5352d4f00da19e20201a568412c.png)


## 详细代码


```java
@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class RpcRequest implements Serializable {
    // 需要调用的服务名
    private String serviceName;
    // 需要调用的方法名
    private String methodName;
    // 方法参数类型列表
    private Class<?>[] parameterTypes;
    // 方法参数列表
    private Object[] args;
}
```


```java
@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class RpcResponse implements Serializable {
    // 响应数据
    private Object data;
    // 相应数据类型
    private Class<?> dataType;
    // 响应信息
    private String message;
    // 异常信息
    private Exception exception;
}
```


```java
public class ServiceProxy implements InvocationHandler {
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        final JDKSerializer serializer = new JDKSerializer();
        RpcRequest rpcRequest = RpcRequest
                .builder()
                .serviceName(method.getDeclaringClass().getName())
                .methodName("getUser")
                .parameterTypes(method.getParameterTypes())
                .args(args)
                .build();
        try {
            byte[] bodyBytes = serializer.serialize(rpcRequest);
            try (HttpResponse httpResponse = HttpRequest
                         .post("http://localhost:8080")
                         .body(bodyBytes)
                         .execute()
            ) {
                byte[] result = httpResponse.bodyBytes();
                RpcResponse rpcResponse = serializer.deserialize(result, RpcResponse.class);
                return rpcResponse.getData();
            }
        } catch (IOException e) {
            e.printStackTrace();
        }

        return null;
    }
}

```


```java
public class ServiceProxyFactory {
    public static <T> T getProxy(Class<T> serviceClass) {
        return (T) Proxy.newProxyInstance(serviceClass.getClassLoader(),new Class[]{serviceClass},new ServiceProxy());
    }
}
```


```java
/**
 * 本地服务注册中心
 */
public class LocalRegister {
    private static final Map<String, Class<?>> servicesMap = new ConcurrentHashMap<>();

    public static void register(String serviceName,Class<?> implClass) {
        servicesMap.put(serviceName,implClass);
    }

    public static Class<?> getService(String serviceName) {
        return servicesMap.get(serviceName);
    }

    public static void unRegister(String serviceName) {
        servicesMap.remove(serviceName);
    }
}
```


```java
public class JDKSerializer implements Serializer {
    @Override
    public <T> byte[] serialize(T obj) throws IOException {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        ObjectOutputStream objectOutputStream = new ObjectOutputStream(outputStream);
        objectOutputStream.writeObject(obj);
        objectOutputStream.close();
        return outputStream.toByteArray();
    }

    @Override
    public <T> T deserialize(byte[] bytes, Class<T> type) throws IOException {
        ByteArrayInputStream inputStream = new ByteArrayInputStream(bytes);
        try (ObjectInputStream objectInputStream = new ObjectInputStream(inputStream)) {
            return ((T) objectInputStream.readObject());
        } catch (ClassNotFoundException e) {
            throw new RuntimeException(e);
        }
    }
}
```


```java
public interface Serializer {
    <T> byte[] serialize(T obj) throws IOException;
    <T> T deserialize(byte[] bytes, Class<T> type) throws IOException;
}
```


```java
public interface HttpServer {
    void doStart(int port);
}
```


```java
public class HttpServerHandler implements Handler<HttpServerRequest> {
    @Override
    public void handle(HttpServerRequest request) {
        final Serializer serializer = new JDKSerializer();
        System.out.println("Received request: " + request.method() + " " + request.uri());

        request.bodyHandler(body -> {
            byte[] bytes = body.getBytes();
            RpcRequest rpcRequest = null;
            try {
                // 请求解码
                rpcRequest = serializer.deserialize(bytes,RpcRequest.class);
            } catch (IOException e) {
                e.printStackTrace();
            }

            RpcResponse rpcResponse = new RpcResponse();

            // 如果请求为空
            if (rpcRequest == null) {
                rpcResponse.setMessage("rpcRequest is null");
                doResponse(request,rpcResponse,serializer);
                return;
            }

            // 获得请求的服务
            Class<?> serviceClass = LocalRegister.getService(rpcRequest.getServiceName());
            try {
                // 获得请求的方法
                Method method = serviceClass.getMethod(rpcRequest.getMethodName(), rpcRequest.getParameterTypes());
                Object result = method.invoke(serviceClass.newInstance(), rpcRequest.getArgs());
                rpcResponse.setData(result);
                rpcResponse.setDataType(method.getReturnType());
                rpcResponse.setMessage("success");
            } catch (Exception e) {
                e.printStackTrace();
                rpcResponse.setMessage(e.getMessage());
                rpcResponse.setException(e);
            }
            doResponse(request,rpcResponse,serializer);
        });
    }

    private void doResponse(HttpServerRequest request,RpcResponse rpcResponse,Serializer serializer) {
        HttpServerResponse httpServerResponse = request.response().putHeader("content-type", "application/json");
        try {
            byte[] serialized = serializer.serialize(rpcResponse);
            httpServerResponse.end(Buffer.buffer(serialized));
        } catch (IOException e) {
            e.printStackTrace();
            httpServerResponse.end(Buffer.buffer());
        }
    }
}

```


```java
public class VertxHttpServer implements HttpServer {
    @Override
    public void doStart(int port) {
        Vertx vertx = Vertx.vertx();
        io.vertx.core.http.HttpServer server = vertx.createHttpServer();
        server.requestHandler(new HttpServerHandler());
        server.listen(port,result -> {
            if (result.succeeded()) {
                System.out.println("Server started on port " + port);
            } else {
                System.err.println("Server start failed: " + result.cause());
            }
        });
    }
}

```


```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.xiang</groupId>
        <artifactId>xy-rpc</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>

    <artifactId>xy-rpc-core</artifactId>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <dependency>
            <groupId>io.vertx</groupId>
            <artifactId>vertx-core</artifactId>
            <version>4.5.1</version>
        </dependency>
        <dependency>
            <groupId>cn.hutool</groupId>
            <artifactId>hutool-all</artifactId>
            <version>5.8.16</version>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <version>1.18.30</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>

</project>
```


# 全局配置加载


在使用RPC框架的时候，我们肯定有一些必须配置的信息，比如注册中心的地址、序列化方式、网络服务端接口号等。目前的项目的处理方法是硬编码，即写死在调用程序中，非常的不优雅。我们迫切需要一套全局配置加载系统，使得可以从配置文件中读取配置对象。


## 配置类设计


在包`com.xiang.config`下面新建配置类`RpcConfig`


```java

/**
 * RPC框架配置
 */
@Data
public class RpcConfig {
 
    /**
     * 名称
     */
    private String name = "k-rpc";
 
    /**
     * 版本号
     */
    private String version = "1.0";
 
    /**
     * 服务器主机名
     */
    private String serverHost = "localhost";
 
    /**
     * 服务器端口号
     */
    private String serverPort = "8080";

```


## 配置文件设计


我们选择application-xxx.properties文件作为配置文件，并且支持不同环境的配置。


我们在`com.xiang.constant`下新建接口`RpcConstant`，规定配置文件中rpc配置的前缀。


```java

/**
 * RPC相关常量
 */
public interface RpcConstant {
 
    /**
     * 默认配置文件加载前缀
     */
    String DEFAULT_CONFIG_PREFIX = "rpc";

```


配置文件示例


```java
rpc.name=xy-rpc
rpc.version=2.0
rpc.serverPort=8081
```


## 配置文件读取


接下来，我们要实现从配置文件中读取RPC框架的配置。


在`com.xiang`中，我们维护了一个全局配置对象，用来初始化全局配置，也是RPC项目的入口。之后每次使用到配置都可以从这个对象中集中获取，节省资源。


```java
@Slf4j
public class RpcApplication {
    private static volatile RpcConfig rpcConfig;
    public static void init(RpcConfig newRpcConfig) {
        rpcConfig = newRpcConfig;
        log.info("rpc init, config = {}", newRpcConfig.toString());
    }

    public static void init() {
        RpcConfig newRpcConfig;
        try {
            // 加载application-xxx.properties中的配置
            newRpcConfig = ConfigUtils.loadConfig(RpcConfig.class, RpcConstant.DEFAULT_CONFIG_PREFIX);
        } catch (Exception e) {
            // 配置加载失败，使用默认值，即RpcConfig类中的默认值
            newRpcConfig = new RpcConfig();
        }
        init(newRpcConfig);
    }

    public static RpcConfig getRpcConfig() {
        // 双检加锁
        if (rpcConfig == null) {
            synchronized (RpcApplication.class) {
                if (rpcConfig == null) {
                    // 初始化全局配置
                    init();
                }
            }
        }
        return rpcConfig;
    }
}

```


在`com.xiang.util`中维护一个工具类，用来加载不同环境下的配置文件


```java
public class ConfigUtils {
    public static <T> T loadConfig(Class<T> tClass,String prefix) {
        return loadConfig(tClass, prefix, "");
    }

    public static <T> T loadConfig(Class<T> tClass,String prefix,String environment) {
        StringBuilder configFileBuilder = new StringBuilder("application");
        // 区分不同的环境
        if (StrUtil.isNotBlank(environment)) {
            configFileBuilder.append("-").append(environment);
        }
        configFileBuilder.append(".properties");
        Props props = new Props(configFileBuilder.toString());
        return props.toBean(tClass,prefix);
    }
}
```


# Mock服务


如果每次测试客户端代码都要访问服务端得到真实响应，这未免太过小题大做，浪费资源和时间。并且，由于RPC是远程调用，可能因为一些不可控因素导致测试无法高效率地进行。因此，我们的框架需要Mock服务，即模拟对象或数据返回，方便测试。


Mock服务依然使用动态代理，直接返回固定默认值。


## 实现


配置类新增Mock配置


```java

@Data
public class RpcConfig {
 
    ...
 
    /**
     * 模拟调用
     */
    private boolean mock = false;

```


创建代理类`MockServiceProxy`，生成代理服务


```java
/**
 * 动态代理实现mock
 * 支持mock后，开发者不必依赖真实的远程服务，即可实现接口测试
 */
@Slf4j
public class MockServiceProxy implements InvocationHandler {
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        Class<?> returnType = method.getReturnType();
        log.info("Mock invoke {}", method.getName());
        return getDefaultObject(returnType);
    }

    /*
    生成指定类型的默认值对象
     */
    private Object getDefaultObject(Class<?> returnType) {
        if (returnType.isPrimitive()) {
            if (returnType == boolean.class) {
                return false;
            }
            // TODO 完善生成的默认值逻辑
        }
        return null;
    }
}
```


这里的生成默认值的逻辑可以自行补充。


在`ServiceProxyFactory`类中新增Mock代理对象的方法getMockProxy


```java
public class ServiceProxyFactory {
    public static <T> T getProxy(Class<T> serviceClass) {
        // 如果开启mock功能，就返回mock代理
        if (RpcApplication.getRpcConfig().getMock()) {
            return getMockProxy(serviceClass);
        }
        // 否则返回真实代理，访问远程服务
        return (T) Proxy.newProxyInstance(serviceClass.getClassLoader(),new Class[]{serviceClass},new ServiceProxy());
    }

    public static <T> T getMockProxy(Class<T> serviceClass) {
        return (T) Proxy.newProxyInstance(serviceClass.getClassLoader(),new Class[]{serviceClass},new MockServiceProxy());
    }
}
```


# 序列化器


只要涉及到数据传输，就很难避开序列化和反序列化这个过程。在RPC中，数据要在Java对象和字节码之间相互转化。序列化器如此重要，我们已有的代码仅仅实现了基于Java原生序列化的JDK序列化器就显得捉襟见肘。


因此，我们的改造目标是使框架支持多种高性能序列化器，并且使用者可以指定某个序列化器或者自定义序列化器。


## 序列化器的选择和实现


### 选择


除了JDK原生序列化器，还有：


**Json**


优点：

- 可读性强，便于理解和调试。
- 跨语言支持，几乎所有编程语言都有Json的解析和生成库。

缺点：

- 序列化后的数据量相对较大。
- 不能很好地处理复杂的数据结构和循环引用，可能导致性能下降或失败。

[**Hessian**](https://blog.csdn.net/zhuqiuhui/article/details/107132002)


优点：

- 二进制序列化，序列化后的数据量小，网络传输效率高。
- 跨语言支持，适用于分布式系统的服务调用。

缺点：

- 相比于Json，性能较低。因为需要将对象转换为二进制格式。
- 对象必须实现Serializable接口，限制了可序列化的对象范围。

[**Kryo**](https://github.com/EsotericSoftware/kryo)


优点：

- 高性能，序列化和反序列化速度快。
- 支持循环引用和自定义序列化器，适用于复杂的对象结构。
- 无需实现Serializable接口，可以序列化任意对象。

缺点：

- 不支持跨语言，只适用于Java。
- 对象的序列化格式不友好，不易读和调试。

### 实现


需要导入的依赖


```xml
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
            <version>2.16.2</version>
        </dependency>
        <dependency>
            <groupId>com.esotericsoftware</groupId>
            <artifactId>kryo</artifactId>
            <version>5.6.0</version>
        </dependency>
        <dependency>
            <groupId>com.caucho</groupId>
            <artifactId>hessian</artifactId>
            <version>4.0.66</version>
        </dependency>
```


```java
public class JsonSerializer implements Serializer {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    @Override
    public <T> byte[] serialize(T obj) throws IOException {
        return OBJECT_MAPPER.writeValueAsBytes(obj);
    }

    @Override
    public <T> T deserialize(byte[] bytes, Class<T> type) throws IOException {
        T obj = OBJECT_MAPPER.readValue(bytes, type);

        // 由于Object的原始对象会被擦除，导致反序列化时会被作为LinkedHashMap无法转换成原始对象，因此这里做了特殊处理。
        if (obj instanceof RpcRequest) {
            return handleRequest((RpcRequest) obj,type);
        }
        if (obj instanceof RpcResponse) {
            return handleResponse((RpcResponse) obj,type);
        }

        return obj;
    }

    private <T> T handleRequest(RpcRequest rpcRequest, Class<T> type) throws IOException {
        Class<?>[] parameterTypes = rpcRequest.getParameterTypes();
        Object[] args = rpcRequest.getArgs();

        // 循环处理每个参数的类型
        for (int i = 0; i < parameterTypes.length; i++) {
            Class<?> clazz = parameterTypes[i];
            // 如果类型不同，需要重新处理一下类型
            if (!clazz.isAssignableFrom(args[i].getClass())) {
                byte[] argBytes = OBJECT_MAPPER.writeValueAsBytes(args[i]);
                args[i] = OBJECT_MAPPER.readValue(argBytes,clazz);
            }
        }
        return type.cast(rpcRequest);
    }
    private <T> T handleResponse(RpcResponse rpcResponse, Class<T> type) throws IOException {
        byte[] dataBytes = OBJECT_MAPPER.writeValueAsBytes(rpcResponse.getData());
        rpcResponse.setData(OBJECT_MAPPER.readValue(dataBytes,rpcResponse.getDataType()));;
        return type.cast(rpcResponse);
    }
}
```


> ❓ 这里为什么要单独处理一下`RpcRequest`和`RpcResponse`？


`ObjectMapper` 在处理泛型或多态对象时，尤其是当对象中包含其他复杂类型的字段时，会出现类型擦除的问题。这意味着在反序列化时，类型信息可能会丢失或不准确，导致反序列化结果与预期类型不符。当Jackson尝试在JSON中反序列化对象时，但未提供目标类型信息时，它将使用默认类型：LinkedHashMap。


在上述代码中，RpcRequest和RpcResponse都是复杂的对象，因此可能会被反序列化为LinkedHashMap，所以需要单独处理这两种对象的内部属性的类型。


```java
public class KryoSerializer implements Serializer {

    // kryo线程不安全，使用ThreadLocal保证每个线程只有一个kryo
    private static final ThreadLocal<Kryo> KRYO_THREAD_LOCAL = ThreadLocal.withInitial(() -> {
        Kryo kryo = new Kryo();
        // 不提前注册所有类，防止安全问题
        kryo.setRegistrationRequired(false);
        return kryo;
    });

    @Override
    public <T> byte[] serialize(T obj) throws IOException {
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        Output output = new Output(byteArrayOutputStream);
        KRYO_THREAD_LOCAL.get().writeObject(output, obj);
        output.close();
        return byteArrayOutputStream.toByteArray();
    }

    @Override
    public <T> T deserialize(byte[] bytes, Class<T> type) throws IOException {
        ByteArrayInputStream byteArrayInputStream = new ByteArrayInputStream(bytes);
        Input input = new Input(byteArrayInputStream);
        T result = KRYO_THREAD_LOCAL.get().readObject(input, type);
        input.close();
        return result;
    }
}
```


```java
public class HessianSerializer implements Serializer {
    @Override
    public <T> byte[] serialize(T obj) throws IOException {
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        HessianOutput hessianOutput = new HessianOutput(byteArrayOutputStream);
        hessianOutput.writeObject(obj);
        return byteArrayOutputStream.toByteArray();
    }

    @Override
    public <T> T deserialize(byte[] bytes, Class<T> type) throws IOException {
        ByteArrayInputStream byteArrayInputStream = new ByteArrayInputStream(bytes);
        HessianInput hessianInput = new HessianInput(byteArrayInputStream);
        return (T) hessianInput.readObject(type);
    }
}
```


## SPI机制


> SPI（Service Provider Interface），服务提供接口。主要用于模块化开发和插件化扩展，通常被服务提供者或扩展框架功能的开发者使用。


SPI机制允许服务提供者通过特定的配置文件将自己的实现注册到系统中，然后系统通过反射机制动态加载这些实现，而无需修改原始框架的代码，从而实现系统的**解耦**。


当服务提供者提供了一种接口的实现之后，需要在classpath下的META-INF/services/目录下创建一个以服务接口命名的文件，这个文件的内容就是接口具体的实现类。


下面是一个例子：


包结构


![Untitled.png](/images/cbf3945a0cfda36354e51bd48956b18a.png)


定义接口


```java
public interface JDKSPIService {
    void doSomething();
}
```


定义实现类A，实现类B类似


```java
public class JDKSPIServiceImplA implements JDKSPIService {
    @Override
    public void doSomething() {
        System.out.println("111");
    }
}
```


配置文件中加载


```text
com.xiang.dubbo.service.JDKSPIServiceImplA
com.xiang.dubbo.service.JDKSPIServiceImplB
```


Main方法


```java
public class Main {
    public static void main(String[] args) {
        ServiceLoader<JDKSPIService> jdkspiServiceServiceLoader = ServiceLoader.load(JDKSPIService.class);
        for(JDKSPIService jdkspiService : jdkspiServiceServiceLoader){
            jdkspiService.doSomething();
        }
    }
}
```


配置文件添加的实现类，都会被加载


## 自定义序列化器


定义序列化器名称的常量


```java
/**
 * 序列化器键名
 */
public interface SerializerKeys {
    String JDK = "jdk";
    String JSON = "json";
    String KRYO = "kryo";
    String HESSIAN = "hessian";
}
```


全局配置类`RpcConfig`中增加序列化器的配置


```java

/**
 * RPC框架配置
 */
@Data
public class RpcConfig {
 
    ...
 
    /**
     * 序列化器
     */
    private String Serializer = SerializerKeys.JDK;
}
 
```


**使用SPI机制动态加载序列化器**


将SPI配置分为系统内置SPI和用户自定义SPI：

- 用户自定义SPI：`META-INF/rpc/custom`。用户可以在该目录下新建配置，加载专属实现类。
- 系统内置SPI：`META-INF/rpc/system`。RPC框架自带的实现类，比如之前开发的`JDKSerializer`。

![Untitled.png](/images/97572b2861e7e7d67942111ff3bb205e.png)


在`src/main/resources/META-INF/rpc/system/com.xiang.serializer.Serializer`中注册序列化器


```text
jdk=com.xiang.serializer.JDKSerializer
hessian=com.xiang.serializer.HessianSerializer
json=com.xiang.serializer.JsonSerializer
kryo=com.xiang.serializer.KryoSerializer
```


创建`SpiLoader`，读取SPI配置并加载实现类


```java
/**
 * spi加载器
 */
@Slf4j
public class SpiLoader {
    /**
     * 存储已经加载好的类
     * key为SPI接口，value为 key为该SPI接口实现类的key，value为实现类Class对象 的map
     */
    private static final Map<String,Map<String,Class<?>>> loaderMap = new ConcurrentHashMap<>();

    /**
     * 实现类缓存
     * key为实现类全类名，value为实现类实例
     */
    private static final Map<String,Object> instanceCache = new ConcurrentHashMap<>();

    /**
     * 系统化spi路径
     */
    private static final String RPC_SYSTEM_SPI_DIR = "META-INF/rpc/system/";

    /**
     * 用户自定义spi路径
     */
    private static final String RPC_CUSTOM_SPI_DIR = "META-INF/rpc/custom/";

    /**
     * 需要扫描的路径，这里为用户和系统spi路径
     * 这里的顺序是先系统后用户，说明用户spi路径下的配置优先级更高
     */
    private static final String[] SCAN_DIRS = new String[]{RPC_SYSTEM_SPI_DIR, RPC_CUSTOM_SPI_DIR};

    /**
     * 需要加载的spi接口集合，这里只有序列化接口
     */
    private static final List<Class<?>> LOAD_CLASS_LIST = List.of(
            Serializer.class
    );


    // 获得tClass接口下key对应的实现类
    public static <T> T getInstance(Class<?> tClass,String key) {
        String tClassName = tClass.getName();
        // 得到tClass接口的实现类的map
        Map<String, Class<?>> keyClassMap = loaderMap.get(tClassName);
        if (keyClassMap == null) {
            throw new RuntimeException(String.format("SpiLoader未加载 %s 类型",tClassName));
        }
        if (!keyClassMap.containsKey(key)) {
            throw new RuntimeException(String.format("SpiLoader的 %s 不存在key=%s 的类型",tClassName,key));
        }
        Class<?> implClass = keyClassMap.get(key);
        String implClassName = implClass.getName();
        if (!instanceCache.containsKey(implClassName)) {
            // 如果缓存池中不存在该实现类的实例，则加入缓存池
            try {
                instanceCache.put(implClassName,implClass.newInstance());
            } catch (InstantiationException | IllegalAccessException e) {
                String errorMsg = String.format("%s 类实例化失败", implClassName);
                throw new RuntimeException(errorMsg,e);
            }
        }
        // 返回缓存池中的该key对应的实现类的实例
        return (T) instanceCache.get(implClassName);
    }

    public static void loadAll() {
        log.info("加载所有SPI");
        for (Class<?> aClass : LOAD_CLASS_LIST) {
            load(aClass);
        }
    }

    // 加载loadClass接口下的所有实现类
    public static Map<String,Class<?>> load(Class<?> loadClass) {
        log.info("加载类型为{}的SPI",loadClass.getName());
        Map<String,Class<?>> keyClassMap = new HashMap<>();
        // 遍历每一个路径
        for (String scanDir : SCAN_DIRS) {
            log.info("扫描路径为{}",scanDir + loadClass.getName());
            List<URL> resources = ResourceUtil.getResources(scanDir + loadClass.getName());
            // 遍历每一个资源文件
            for (URL resource : resources) {
                try {
                    InputStreamReader inputStreamReader = new InputStreamReader(resource.openStream());
                    BufferedReader bufferedReader = new BufferedReader(inputStreamReader);
                    String line;
                    while ((line = bufferedReader.readLine()) != null) {
                        String[] strArray = line.split("=");
                        if (strArray.length > 1) {
                            // 读取key和value
                            String key = strArray[0];
                            String className = strArray[1];
                            keyClassMap.put(key,Class.forName(className));
                        }
                    }
                } catch (IOException | ClassNotFoundException e) {
                    log.error("SPI资源加载错误！");
                }
            }
        }
        // 加入loaderMap
        loaderMap.put(loadClass.getName(),keyClassMap);
        return keyClassMap;
    }
}

```


注意到，这里用map实现了一个缓存池，有很多好处：

1. 采用缓存机制，提高代码效率
2. 创建对象之前先检查一下缓存池中有没有，避免了重复创建实例对象，减少资源消耗
3. 实现了类加载和实例化的分离

另外，扫描SPI路径是先扫描系统路径再扫描用户路径，因此相同配置下用户路径的优先级更高，会覆盖系统配置。


实现序列化器工厂`SerializerFactory`


```java
@Slf4j
public class SerializerFactory {
    // 在静态代码块中加载Serializer接口的配置
    static {
        SpiLoader.load(Serializer.class);
    }

    // 默认序列化器
    private static final Serializer DEFAULT_SERIALIZER = new JDKSerializer();

    // 获得key对应的序列化器的实例
    public static Serializer getInstance(String key) {
        try {
            Serializer serializer = SpiLoader.getInstance(Serializer.class,key);
            return serializer;
        } catch (Exception e) {
            log.error(e.getMessage());
            return DEFAULT_SERIALIZER;
        }
    }
}
```


在使用序列化器的时候就可以从工厂中直接获得


```java
public class HttpServerHandler implements Handler<HttpServerRequest> {
    @Override
    public void handle(HttpServerRequest request) {
        // 在这里获得配置类中配置的序列化器
        final Serializer serializer = SerializerFactory.getInstance(RpcApplication.getRpcConfig().getSerializer());
        
        ......
    }
}
```


```java
@Slf4j
public class ServiceProxy implements InvocationHandler {
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        final Serializer serializer = SerializerFactory.getInstance(RpcApplication.getRpcConfig().getSerializer());
        
        ......
    }
}
```


# 注册中心


注册中心也是我们的老朋友了，Nacos、Zookeeper、Consul等服务注册中心相信都学过用过，CAP理论、心跳检测也肯定有所耳闻。


> ❓ 在先前的代码中，我们已经实现了`LocalRegister`本地服务注册中心，为什么还要需要注册中心呢？


其实这是一个陷阱问题，因为我们先前写过的`LocalRegister`是服务端侧的，即在服务端注册在自己端，方便自己来调用服务的。


但是我们现在要实现的注册中心就截然不同了。


我们要实现的注册中心的作用是消费者侧的，是为了帮助消费者获取到服务提供者的调用地址，而不是将地址硬编码在项目中。


注册中心需要实现以下功能：

- 注册信息的分布式存储：集中存储服务端节点的注册信息
- 服务注册
- 服务发现
- 服务注销
- 服务节点下线
- 心跳检测和续期

注册信息在注册中心内的存储：


由于一个服务可能有多个服务提供者（负载均衡），可以有两种结构设计：

- 层级结构
	- 服务就是文件夹，服务下的节点就是文件夹内的文件。可以通过服务名称，用前缀查询的方式查到某个服务的所有节点。比如，键名的规则可以是 **/业务前缀/服务名/服务节点地址**
- 列表结构
	- 将所有的服务节点以列表的形式整体作为value。

选择哪种存储结构与技术选型有关。Etcd和Zookeeper支持层级查询，选择层级结构较好；Redis本身支持列表数据结构，选择列表结构更合适。同时要给key设置过期时间，默认30s，这样即使服务提供者宕机，超时后也会自动移除。


在本例的设计中，我们预计使用三种方式实现注册中心：Etcd、Nacos和Redis


## Etcd注册中心


### Etcd介绍


Etcd是一个基于Go语言实现的开源**分布式键值存储系统**，主要用于分布式系统中的服务发现、配置管理和分布式锁等场景。它通常被作为云原生应用的基础设施，存储元信息，性能较高。


此外，Etcd采用Raft一致性算法来保证数据的一致性和可靠性，具有高可用性、强一致性、分布式等特性。它提供了简单的API、数据过期机制、数据监听和通知机制等，非常适合做注册中心。


Etcd采用层次化的键值对存储数据，支持类似于文件系统路径的层次结构，和Zookeeper相似，能够灵活地单key查询、按前缀查询、按范围查询。


**Etcd的核心数据结构：**

- Key（键）：Etcd中的基本数据单元，类似于文件系统中的文件名。每个键都唯一标识一个值，并且可以包含子健，形成类似于路径的层次结构。
- Value（值）：与键关联的数据，可以是任意类型的数据，通常是字符串形式。

因为只有键和值，所以更易理解，并且可以将数据序列化后写入value。


**Etcd的常用特性：**

- Lease（租约）：用于对键值对进行TTL超时设置。即键值对的过期时间。过期后键值对将被自动删除。
- Watch（监听）：监听特定键的变化并触发相应的通知机制。

**Etcd保证数据的一致性：**

- 支持事务操作，能够保证数据一致性。
- 使用Raft一致性算法保证。

### 基本实现


引入依赖


```xml
        <dependency>
            <groupId>io.etcd</groupId>
            <artifactId>jetcd-core</artifactId>
            <version>0.7.7</version>
        </dependency>
```


在`com.xiang.model`包下创建注册元信息类


```java
/**
 * 服务元信息
 */
@Data
@Accessors(chain = true)
public class ServiceMetaInfo {
    private String serviceName;
    private String serviceVersion = "1.0";
    private String serviceHost;
    private Integer servicePort;
    private String serviceGroup = "DEFAULT_GROUP";
    public String getServiceKey() {
        return String.format("%s:%s",serviceName,serviceVersion);
    }
    public String getServiceNodeKey() {
        return String.format("%s/%s:%s",getServiceKey(),serviceHost,servicePort);
    }
    // 获得完整服务地址
    public String getServiceAddress() {
        if (StrUtil.contains(serviceHost,"http")) {
            return String.format("http://%s:%s",serviceHost,servicePort);
        }
        return String.format("%s:%s",serviceHost,servicePort);
    }
}
```


创建注册中心接口


```java
/**
 * 注册中心接口
 */
public interface Registry {
    void init(RegistryConfig registryConfig);
    // 服务端注册服务
    void register(ServiceMetaInfo serviceMetaInfo) throws Exception;
    // 服务端注销服务
    void unregister(ServiceMetaInfo serviceMetaInfo);
    // 消费端获得服务列表
    List<ServiceMetaInfo> serviceDiscovery(String serviceKey);
    // 服务销毁
    void destroy();
    // 心跳检测
    void heartbeat();
    /*
    服务注册信息变化的时候，缓存的信息也要及时更新
    因此采用监听机制，监听每一个key，当key发生修改或删除的时候，会触发事件通知
     */
    // 消费端监听
    void watch(String serviceNodeKey);
}
```


创建`EtcdRegistry`类，实现Etcd注册中心具体逻辑


```java
@Slf4j
public class EtcdRegistry implements Registry {

    // 客户端
    private Client client;
    // 键值对客户端
    private KV kvClient;
    // 根结点
    private static final String ETCD_ROOT_PATH = "/rpc/";
   
    @Override
    public void init(RegistryConfig registryConfig) {
        client = Client
                .builder()
                .endpoints(registryConfig.getAddress())
                .connectTimeout(Duration.ofMillis(registryConfig.getTimeout()))
                .build();
        kvClient = client.getKVClient();
        
    }

    @Override
    public void register(ServiceMetaInfo serviceMetaInfo) throws Exception {
        // 获得一个租约客户端
        /*
        租约（Lease）机制
        租约：是一种让键值对在特定时间后自动过期的机制。在 Etcd 中，你可以创建一个租约，并将键值对与该租约关联。租约到期后，所有与之关联的键值对都会被自动删除。
        作用：租约机制可以用于实现临时键值对（如服务注册信息），保证这些信息不会因为服务意外宕机而一直存在，从而保持系统的一致性和健康状态。
         */
        Lease leaseClient = client.getLeaseClient();
        // 租约客户端设置30s的过期时间，获取其id
        long leaseId = leaseClient.grant(30).get().getID();
        String registryKey = ETCD_ROOT_PATH + serviceMetaInfo.getServiceNodeKey();
        // 将registryKey和json序列化后的serviceMetaInfo转化为ByteSequence形式
        ByteSequence key = ByteSequence.from(registryKey, StandardCharsets.UTF_8);
        ByteSequence value = ByteSequence.from(JSONUtil.toJsonStr(serviceMetaInfo), StandardCharsets.UTF_8);
        // 创建一个putOption类，该类是配置put操作的操作类。设置租约客户端id
        PutOption putOption = PutOption.builder().withLeaseId(leaseId).build();
        // 在kv客户端中put进一对kv，设置的租约时间为30s，即30s后kv过期
        kvClient.put(key,value,putOption).get();
    }

    @Override
    public void unregister(ServiceMetaInfo serviceMetaInfo) {
        String registryKey = ETCD_ROOT_PATH + serviceMetaInfo.getServiceNodeKey();
        kvClient.delete(ByteSequence.from(ETCD_ROOT_PATH + serviceMetaInfo.getServiceNodeKey(),StandardCharsets.UTF_8));
    }

    @Override
    public List<ServiceMetaInfo> serviceDiscovery(String serviceKey) {

        // 前缀搜索，结尾要加/
        String searchPrefix = ETCD_ROOT_PATH + serviceKey + "/";
        try {
            GetOption getOption = GetOption.builder().isPrefix(true).build();
            List<KeyValue> kvs = kvClient.get(ByteSequence.from(searchPrefix, StandardCharsets.UTF_8), getOption).get().getKvs();
            List<ServiceMetaInfo> serviceMetaInfoList = kvs
                    .stream()
                    .map(kv -> {
                        String key = kv.getKey().toString(StandardCharsets.UTF_8);
                        String value = kv.getValue().toString(StandardCharsets.UTF_8);
                        return JSONUtil.toBean(value, ServiceMetaInfo.class);
                    })
                    .collect(Collectors.toList());
           
            return serviceMetaInfoList;
        } catch (InterruptedException | ExecutionException e) {
            throw new RuntimeException("获取服务列表失败",e);
        }
    }

    @Override
    public void destroy() {
        log.info("当前节点下线");
        
        //关闭客户端
        if (kvClient != null){
            kvClient.close();
        }
        if (client != null){
            client.close();
        }
    }

    @Override
    public void heartbeat() {
       
    }

    @Override
    public void watch(String serviceNodeKey) {

    }
}
```


然后就是使用SPI机制使其具有扩展性的丝滑小连招


```java
/**
 * 注册中心键名常量
 */
public interface RegistryKeys {
 
    String ETCD = "etcd";
 
    String ZOOKEEPER = "zookeeper";
}
```


```java
@Slf4j
public class RegistryFactory {
    static {
        SpiLoader.load(Registry.class);
    }

    private static final Registry DEFAULT_REGISTRY = new EtcdRegistry();

    public static Registry getInstance(String key) {
        try {
            Registry registry = SpiLoader.getInstance(Registry.class,key);
            return registry;
        } catch (Exception e) {
            log.error(e.getMessage());
            return DEFAULT_REGISTRY;
        }
    }
}
```


在`META-INF/rpc/system`目录下编写注册中心接口的SPI配置文件


在`SpiLoader`的`LOAD_CLASS_LIST`添加注册中心接口


```java
/**
 * spi加载器
 */
@Slf4j
public class SpiLoader {
    
    /**
     * 需要加载的spi接口集合，这里只有序列化接口
     */
    private static final List<Class<?>> LOAD_CLASS_LIST = List.of(
            Serializer.class,
            Registry.class
    );
```


创建`RegistryConfig`类，作为注册中心配置类，并将其加入`RpcConfig`


```java
@Data
public class RegistryConfig {
    // 注册中心类别
    private String registry = "etcd";
    private String address = "http://localhost:2379";
    private String username;
    private String password;
    // 超时时间 ms
    private Long timeout = 10000L;
    // 线程池大小
    private Integer threadPoolSize = 5;
}
```


```java
/**
 * 全局配置类
 */
@Data
public class RpcConfig {
    private String name = "xy-rpc";
    private String version = "1.0.0";
    private String serverHost = "localhost";
    private String serverPort = "8080";
    // mock功能，默认为false
    private Boolean mock = false;
    private String serializer = SerializerKeys.JDK;
    // 配置中心配置
    private RegistryConfig registryConfig = new RegistryConfig();
}
```


接着，在入口类中初始化配置中心


```java
@Slf4j
public class RpcApplication {
    private static volatile RpcConfig rpcConfig;
    public static void init(RpcConfig newRpcConfig) {
        rpcConfig = newRpcConfig;
        log.info("rpc init, config = {}", newRpcConfig.toString());

        // 注册中心初始化
        // 服务提供者和消费者都需要和注册中心建立连接，是RPC框架启动后的必经流程，因此将注册中心的初始化放在RpcApplication类中
        RegistryConfig registryConfig = rpcConfig.getRegistryConfig();
        Registry registry = RegistryFactory.getInstance(registryConfig.getRegistry());
        registry.init(registryConfig);
        log.info("注册中心初始化，配置为 {}",registryConfig);
    }
    
    ......
}
```


最后，修改消费者调用逻辑


```java
@Slf4j
public class ServiceProxy implements InvocationHandler {
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        final Serializer serializer = SerializerFactory.getInstance(RpcApplication.getRpcConfig().getSerializer());;
        RpcRequest rpcRequest = RpcRequest
                .builder()
                .serviceName(method.getDeclaringClass().getName())
                .methodName(method.getName())
                .parameterTypes(method.getParameterTypes())
                .args(args)
                .build();
            byte[] bodyBytes = serializer.serialize(rpcRequest);

				// 调用注册中心
        Registry registry = RegistryFactory.getInstance(RpcApplication.getRpcConfig().getRegistryConfig().getRegistry());
        ServiceMetaInfo serviceMetaInfo = new ServiceMetaInfo()
                .setServiceName(method.getDeclaringClass().getName())
                .setServiceVersion(RpcConstant.DEFAULT_SERVICE_VERSION);
        List<ServiceMetaInfo> serviceMetaInfoList = registry.serviceDiscovery(serviceMetaInfo.getServiceKey());
        if (CollUtil.isEmpty(serviceMetaInfoList)) {
            throw new RuntimeException("暂无服务地址！");
        }
        //暂时先取第一个
        ServiceMetaInfo selectedServiceMetaInfo = serviceMetaInfoList.get(0);
        
        ......
    }
}
```


### 心跳机制和自动续期


> 心跳检测（HeartBeat）是一种用于监测系统是否正常工作的机制。它通过定期发送**心跳信号（请求）**来检测目标系统的状态。如果接收方在一定时间内没有收到心跳信号或者未能正常响应请求，就会认为目标系统故障或不可用，从而触发通知或告警机制。


	心跳监测被广泛应用于分布式、微服务系统中，做服务健康监测或集群管理等。


由于Etcd的key我们已经设置了30s的过期机制，所以节点注册的时候有一个30s的TTL，只需要让节点定期续费，重置自己的倒计时即可。如果节点宕机，那么将不会续期，于是节点的key就会被删除。


在服务端维护一个本地注册的节点的key的集合，注册时节点被加入到集合，续期的时候只需要续费集合内的节点，方便维护续期。


`EtcdRegistry`中添加属性`localRegisterNodeKeySet`


```java
    /**
     * 本机注册的节点 key 集合（用于维护续期）
     */
    private final Set<String> localRegisterNodeKeySet = new HashSet<>();
```


服务注册时，将节点添加到集合中


```java
    @Override
    public void register(ServiceMetaInfo serviceMetaInfo) throws Exception{
    
		    ......

				//添加节点信息到本地缓存
        localRegisterNodeKeySet.add(registerKey);
		}
```


服务注销时，从集合中移除对应节点


```java
    @Override
    public void unRegister(ServiceMetaInfo serviceMetaInfo){
        String registerKey = ETCD_ROOT_PATH + serviceMetaInfo.getServiceNodeKey();
        kvClient.delete(ByteSequence.from(registerKey,StandardCharsets.UTF_8));
				//从本地缓存中移除
        localRegisterNodeKeySet.remove(registerKey);
    }
```


实现`heartbeat`方法


```java
    @Override
    public void heartbeat() {
        CronUtil.schedule("*/10 * * * * *", new Task() {
            @Override
            public void execute() {
                for (String key : localRegisterNodeKeySet) {
                    try {
                        List<KeyValue> kvs = kvClient
                                .get(ByteSequence.from(key, StandardCharsets.UTF_8))
                                .get()
                                .getKvs();
                        // 如果etcd中没有，即节点已经过期，则需要重启节点才能重新注册
                        if (CollUtil.isEmpty(kvs)) {
                            continue;
                        }
                        // 如果节点未过期，则续签（自动重新注册）
                        KeyValue keyValue = kvs.get(0);
                        String value = keyValue.getValue().toString(StandardCharsets.UTF_8);
                        ServiceMetaInfo serviceMetaInfo = JSONUtil.toBean(value, ServiceMetaInfo.class);
                        register(serviceMetaInfo);
                        log.info("节点{}续签成功",key);
                    } catch (Exception e) {
                        throw new RuntimeException(key + "续签失败", e);
                    }
                }
            }
        });
        // 支持秒级别定时任务
        CronUtil.setMatchSecond(true);
        CronUtil.start();
    }
```


在init方法中调用`heartbeat`方法


```java
    @Override
    public void init(RegistryConfig registryConfig) {
        client = Client
                .builder()
                .endpoints(registryConfig.getAddress())
                .connectTimeout(Duration.ofMillis(registryConfig.getTimeout()))
                .build();
        kvClient = client.getKVClient();
        // 调用心跳方法
        heartbeat();
    }
```


### 服务下线机制


当服务节点宕机时，服务应该在注册中心下线，即注册中心应该移除掉这些失效节点。


被动下线：服务提供者出现异常时，不会再进行续期，Etcd可以利用key的过期机制将其移除，已经实现。


主动下线：可以主动从注册中心移除服务信息。Java项目退出时，执行注册中心接口定义的destroy方法。


如何实现主动下线？我们可以利用JVM的ShutdownHook，允许开发者在JVM即将关闭前执行清理工作或其它必要操作，如关闭数据库连接、释放资源等，是一种优雅停机能力。


在destroy方法中依次下线本地缓存中的节点


```java
    @Override
    public void destroy() {
        log.info("当前节点下线");
        for (String key : localRegisterNodeKeySet) {
            try {
                kvClient.delete(ByteSequence.from(key,StandardCharsets.UTF_8)).get();
            } catch (InterruptedException | ExecutionException e) {
                throw new RuntimeException(key + "节点下线失败");
            }

        }

        //关闭客户端
        if (kvClient != null){
            kvClient.close();
        }
        if (client != null){
            client.close();
        }
    }
```


在`RpcApplication`的`init`方法中注册ShutdownHook，当程序正常退出时会执行注册中心的`destory`方法


```java
    public static void init(RpcConfig newRpcConfig){
		    ......
		    
				//创建并注册Shutdown Hook，JVM退出时执行操作
        Runtime.getRuntime().addShutdownHook(new Thread(registry::destory));
    }
```


### 消费端服务缓存


服务节点信息列表更新频率低，消费者可以将信息缓存在本地，直接读取缓存，提高性能。


建立消费端服务信息缓存类`RegistryServiceCache`


```java
/**
 * 消费者端服务节点信息缓存
 * 服务节点更新频率不高，可以将服务节点信息列表缓存在本地，不用每次都取注册中心请求，直接从缓存读取提高性能
 */
public class RegistryServiceCache {
    List<ServiceMetaInfo> serviceCache;

    void writeCache(List<ServiceMetaInfo> newServiceCache) {
        this.serviceCache = newServiceCache;
    }

    List<ServiceMetaInfo> readCache() {
        return this.serviceCache;
    }

    void clearCache() {
        this.serviceCache = null;
    }
}

```


在`EtcdRegistry`中维护一个`RegistryServiceCache`属性


```java
    // 注册本地服务信息列表缓存（客户端）
    private final RegistryServiceCache registryServiceCache = new RegistryServiceCache();
```


修改服务发现逻辑，优先从缓存中获取。如果缓存中没有，再从注册中心获取并设置到缓存中


```java
    @Override
    public List<ServiceMetaInfo> serviceDiscovery(String serviceKey) {
        // 客户端优先从缓存中获取服务
        List<ServiceMetaInfo> cachedServiceMetaInfoList = registryServiceCache.readCache();
        if (cachedServiceMetaInfoList != null) {
            return cachedServiceMetaInfoList;
        }


        // 前缀搜索，结尾要加/
        String searchPrefix = ETCD_ROOT_PATH + serviceKey + "/";
        try {
            GetOption getOption = GetOption.builder().isPrefix(true).build();
            List<KeyValue> kvs = kvClient.get(ByteSequence.from(searchPrefix, StandardCharsets.UTF_8), getOption).get().getKvs();
            List<ServiceMetaInfo> serviceMetaInfoList = kvs
                    .stream()
                    .map(kv -> {
                        String key = kv.getKey().toString(StandardCharsets.UTF_8);
                        String value = kv.getValue().toString(StandardCharsets.UTF_8);
                        return JSONUtil.toBean(value, ServiceMetaInfo.class);
                    })
                    .collect(Collectors.toList());
            // 写入缓存
            registryServiceCache.writeCache(serviceMetaInfoList);
            return serviceMetaInfoList;
        } catch (InterruptedException | ExecutionException e) {
            throw new RuntimeException("获取服务列表失败",e);
        }
    }
```


### 缓存信息的更新和监听机制


当服务注册信息发生改变时，缓存中的信息也要跟着改变。因此需要监听服务信息的变化。


使用Etcd的监听机制，在某个kv发生变化的时候，就会触发事件通知


在`EtcdRegistry`中维护一个集合`watchingKeySet`，用来保存已经监听的key


```java
		// 为了防止重复监听同一个key，设置一个已监听的key
		// 正在监听的key的集合，使用防止并发冲突的集合
    private final Set<String> watchingKeySet = new ConcurrentHashSet<>();
```


实现`watch`方法


```java
    @Override
    public void watch(String serviceNodeKey) {
        Watch watchClient = client.getWatchClient();
        boolean newWatchFlag = watchingKeySet.add(serviceNodeKey);
        if (newWatchFlag) {
            watchClient.watch(ByteSequence.from(serviceNodeKey,StandardCharsets.UTF_8),res -> {
                for (WatchEvent event : res.getEvents()) {
                    switch (event.getEventType()) {
		                    // 当key被删除的时候，清理缓存
                        case DELETE -> registryServiceCache.clearCache();
                        case PUT -> {}
                        default -> {break;}
                    }
                }
            });
        }
    }
```


在`serviceDiscovery`方法中得到的服务列表中依次调用`watch`方法


```java
    @Override
    public List<ServiceMetaInfo> serviceDiscovery(String serviceKey) {
        // 客户端优先从缓存中获取服务
        List<ServiceMetaInfo> cachedServiceMetaInfoList = registryServiceCache.readCache();
        if (cachedServiceMetaInfoList != null) {
            return cachedServiceMetaInfoList;
        }


        // 前缀搜索，结尾要加/
        // TODO 这里为什么要搜索serviceKey对应的服务列表，并且每次更新缓存都是重写而不是追加？？？
        String searchPrefix = ETCD_ROOT_PATH + serviceKey + "/";
        try {
            GetOption getOption = GetOption.builder().isPrefix(true).build();
            List<KeyValue> kvs = kvClient.get(ByteSequence.from(searchPrefix, StandardCharsets.UTF_8), getOption).get().getKvs();
            List<ServiceMetaInfo> serviceMetaInfoList = kvs
                    .stream()
                    .map(kv -> {
                        String key = kv.getKey().toString(StandardCharsets.UTF_8);
                        // 监听key的变化
                        watch(key);
                        String value = kv.getValue().toString(StandardCharsets.UTF_8);
                        return JSONUtil.toBean(value, ServiceMetaInfo.class);
                    })
                    .collect(Collectors.toList());
            // 写入缓存
            registryServiceCache.writeCache(serviceMetaInfoList);
            return serviceMetaInfoList;
        } catch (InterruptedException | ExecutionException e) {
            throw new RuntimeException("获取服务列表失败",e);
        }
    }
```


## Nacos注册中心


与Etcd的实现相类似，这里我简单实现了一下，不再详细赘述


API参考官方文档：


[embed](https://nacos.io/docs/latest/manual/user/java-sdk/usage/)


依赖：


```xml
        <dependency>
            <groupId>com.alibaba.nacos</groupId>
            <artifactId>nacos-client</artifactId>
            <version>2.4.0</version>
        </dependency>
```


注意，这里的版本必须大于等于2.4.0才有`AbstractNamingChangeListener`这个类，即小于2.4.0的版本不能区分服务实例发生的具体事件（例如删除、修改），进而无法对不同的事件进行不同的处理。


实现：


```java
@Slf4j
public class NacosRegistry implements Registry {
    private NamingService namingService;

    private EventListener eventListener;

    private final ExecutorService executorService = Executors.newFixedThreadPool(RpcApplication.getRpcConfig().getRegistryConfig().getThreadPoolSize());


    private final Set<ServiceMetaInfo> localRegisterNodeKeySet = new HashSet<>();

    private final RegistryServiceCache registryServiceCache = new RegistryServiceCache();

    private final Set<String> watchingKeySet = new ConcurrentHashSet<>();


    @Override
    public void init(RegistryConfig registryConfig) {
        try {
            namingService = NamingFactory.createNamingService(registryConfig.getAddress());
        } catch (NacosException e) {
            throw new RuntimeException("Nacos服务注册中心初始化失败！",e);
        }

        // 初始化监听器
        eventListener = new AbstractNamingChangeListener() {
            @Override
            public void onChange(NamingChangeEvent event) {
                if (event.isAdded()) {
                }
                if (event.isRemoved()) {
                    registryServiceCache.clearCache();
                    log.info("服务{}被删除",event.getRemovedInstances());
                }
                if (event.isModified()) {
                }
            }

            @Override
            public Executor getExecutor() {
                return executorService;
            }
        };

//        eventListener = event -> {
//            if (event instanceof NamingEvent namingEvent) {
//                System.out.println("当前线程：" + Thread.currentThread().getName() + " ,监听到实例名称：" + namingEvent.getServiceName());
//                System.out.println("当前线程：" + Thread.currentThread().getName() + " ,监听到实例内容：" + namingEvent.getInstances());
//            }
//        };
    }

    @Override
    public void register(ServiceMetaInfo serviceMetaInfo) throws Exception {
        String serviceKey = serviceMetaInfo.getServiceKey();
        Instance instance = new Instance();
        instance.setIp(serviceMetaInfo.getServiceHost());
        instance.setPort(serviceMetaInfo.getServicePort());
        instance.setServiceName(serviceKey);
        instance.setEnabled(true);
        // 健康状态
        instance.setHealthy(true);
        instance.setWeight(1.0);

        namingService.registerInstance(serviceKey,instance);
        log.info("服务{}注册成功",serviceMetaInfo);


        localRegisterNodeKeySet.add(serviceMetaInfo);
    }

    @Override
    public void unregister(ServiceMetaInfo serviceMetaInfo) {
        String serviceKey = serviceMetaInfo.getServiceKey();
        try {
            if (watchingKeySet.contains(serviceMetaInfo.getServiceKey())) {
                namingService.unsubscribe(serviceKey, eventListener);
                log.info("服务{}取消监听成功",serviceMetaInfo);
            }

            Instance instance = new Instance();
            instance.setIp(serviceMetaInfo.getServiceHost());
            instance.setPort(serviceMetaInfo.getServicePort());
            namingService.deregisterInstance(serviceKey,instance);
            localRegisterNodeKeySet.remove(serviceMetaInfo);
            log.info("服务{}注销成功",serviceMetaInfo);

        } catch (NacosException e) {
            throw new RuntimeException("服务注销失败！",e);
        }
    }

    @Override
    public List<ServiceMetaInfo> serviceDiscovery(String serviceKey) {
        List<ServiceMetaInfo> cachedServiceMetaInfoList = registryServiceCache.readCache();
        if (cachedServiceMetaInfoList != null) {
            return cachedServiceMetaInfoList;
        }

        try {
            List<Instance> allInstances = namingService.getAllInstances(serviceKey);
            List<ServiceMetaInfo> serviceMetaInfoList = allInstances
                    .stream()
                    .map(instance -> {
                        watch(instance.getServiceName());

                        return new ServiceMetaInfo()
                                .setServicePort(instance.getPort())
                                .setServiceHost(instance.getIp())
                                .setServiceName(instance.getServiceName().split(":")[0])
                                // TODO instance没有group
                                .setServiceGroup(null)
                                .setServiceVersion(instance.getServiceName().split(":")[1]);
                    })
                    .collect(Collectors.toList());
            registryServiceCache.writeCache(serviceMetaInfoList);
            return serviceMetaInfoList;

        } catch (NacosException e) {
            throw new RuntimeException("获取服务列表失败",e);
        }
    }

    @Override
    public void destroy() {
        log.info("当前节点下线");

        for (ServiceMetaInfo serviceMetaInfo : localRegisterNodeKeySet) {
            unregister(serviceMetaInfo);
        }

        try {
            if (namingService != null) {
                namingService.shutDown();
            }
        } catch (NacosException e) {
            throw new RuntimeException("节点下线失败！",e);
        }
    }

    @Override
    public void heartbeat() {
    }

    @Override
    public void watch(String serviceKey) {
        boolean flag = watchingKeySet.add(serviceKey);
        if (flag) {
            try {
                // 添加监听
                namingService.subscribe(serviceKey, eventListener);
            } catch (NacosException e) {
                throw new RuntimeException("监听失败！", e);
            }
            log.info("服务{}已被监听", serviceKey);
        }
    }
}

```


# 自定义协议


> 在先前的设计中，我们一直使用Http协议作为client与server之间的传输协议


## 问题

- http协议头部信息较重，会影响传输性能
- 本身属于无状态协议，即每个HTTP请求相互独立，每次响应都需要重新建立和关闭连接，也会影响性能。
- HTTP属于应用层协议，性能不如传输层的TCP协议高。

因此，我们可以采用TCP协议，自定义一个高性能通信的网络协议和传输方式


## 设计


参考Http协议架构和Dubbo协议架构：


![Untitled.png](/images/c88b4ace33493f094c5103da458d9533.png)

1. 采用byte作为数据类型，相比其他数据类型更轻量化
2. 请求头的设计
	1. 魔数：用来安全校验，防止服务器处理非框架消息（类似于HTTPS的安全证书）。
	2. 版本号：保证请求和响应的一致性（类似于HTTP协议的1.0/2.0版本）。
	3. 序列化方式：告诉服务端和客户端如何解析数据（类似于HTTP的Content—Type）。
	4. 类型：标记消息是Request或Response，或者是heartBeat（类似于HTTP的请求响应头）。
	5. 请求id：用于唯一标识请求，因为TCP是双向通信，需要有唯一标识来追踪每个请求。
	6. 状态：如果是响应，记录响应的结果（类似于HTTP的200状态码）。
	7. 请求体数据长度：保证完整地获取到请求体内容。HTTP协议有专门的key/value结构，比较容易找到完整的请求体数据，但TCP协议本身存在半包和粘包问题，每次传输的数据可能是不完整的，因此需要在消息头中增加一个字段请求体数据长度，保证能够完整地获取到信息内容。
3. 请求体：即数据内容（类似于HTTP请求中发送的RpcRequest）。

## 实现


### 前置准备


在`com.xiang.protocal`下建立类：


`ProtocolMessage<T>` 


协议消息类


```java
@Data
@AllArgsConstructor
@NoArgsConstructor
public class ProtocolMessage<T> {
    private Header header;
    private T body;

    @Data
    public static class Header {
        // 魔数，保证安全性
        private byte magic;
        private byte version;
        private byte serializer;
        private byte type;
        private byte status;
        // 请求id
        private long requestId;
        // 消息体长度
        private int bodyLength;
    }
}
```


`ProtocolConstant`


定义了协议有关的常量


```java
public interface ProtocolConstant {
    /**
     * 消息头长度
     */
    int MESSAGE_HEADER_LENGTH = 17;

    /**
     * 协议魔数
     */
    byte PROTOCOL_MAGIC = 0x1;

    /**
     * 协议版本号
     */
    byte PROTOCOL_VERSION = 0x1;
}

```


`ProtocolMessageSerializerEnum`


```java
/**
 * 协议消息的序列化器枚举
 */
@Getter
public enum ProtocolMessageSerializerEnum {

    JDK(0, "jdk"),
    JSON(1, "json"),
    KRYO(2, "kryo"),
    HESSIAN(3, "hessian");

    private final int key;

    private final String value;

    ProtocolMessageSerializerEnum(int key, String value) {
        this.key = key;
        this.value = value;
    }

    public static List<String> getValues() {
        return Arrays.stream(values()).map(item -> item.value).collect(Collectors.toList());
    }

    public static ProtocolMessageSerializerEnum getEnumByKey(int key) {
        for (ProtocolMessageSerializerEnum anEnum : ProtocolMessageSerializerEnum.values()) {
            if (anEnum.key == key) {
                return anEnum;
            }
        }
        return null;
    }

    public static ProtocolMessageSerializerEnum getEnumByValue(String value) {
        if (ObjectUtil.isEmpty(value)) {
            return null;
        }
        for (ProtocolMessageSerializerEnum anEnum : ProtocolMessageSerializerEnum.values()) {
            if (anEnum.value.equals(value)) {
                return anEnum;
            }
        }
        return null;
    }
}
```


`ProtocolMessageStatusEnum`


```java
/**
 * 协议消息的状态枚举
 */
@Getter
public enum ProtocolMessageStatusEnum {
    OK("OK", 20),
    BAD_REQUEST("BadRequest", 40),
    BAD_RESPONSE("BadResponse", 50);

    private final String text;
    private final int value;

    ProtocolMessageStatusEnum(String text, int value) {
        this.text = text;
        this.value = value;
    }

    public static ProtocolMessageStatusEnum getEnumByValue(int value) {
        for (ProtocolMessageStatusEnum protocolMessageStatusEnum : ProtocolMessageStatusEnum.values()) {
            if (protocolMessageStatusEnum.value == value) {
                return protocolMessageStatusEnum;
            }
        }
        return null;
    }
}
```


`ProtocolMessageTypeEnum`


```java
/**
 * 协议消息的类型枚举
 */
@Getter
public enum ProtocolMessageTypeEnum {
    REQUEST(0),
    RESPONSE(1),
    HEART_BEAT(2),
    OTHERS(3);

    private final int key;

    ProtocolMessageTypeEnum(int key){
        this.key = key;
    }

    /**
     * 根据 key 获取枚举
     */
    public static ProtocolMessageTypeEnum getEnumByType(int key){
        for (ProtocolMessageTypeEnum anEnum : ProtocolMessageTypeEnum.values()){
            if (anEnum.key == key){
                return anEnum;
            }
        }
        return null;
    }

}
```


`ProtocolMessageDecoder`


解码器


```java
public class ProtocolMessageDecoder {
    public static ProtocolMessage<?> decode(Buffer buffer) throws IOException {
        ProtocolMessage.Header header = new ProtocolMessage.Header();
        byte magic = buffer.getByte(0);
        // 校验魔数
        if (magic != ProtocolConstant.PROTOCOL_MAGIC) {
            throw new RuntimeException("消息魔数非法！");
        }
        header.setMagic(magic);
        header.setVersion(buffer.getByte(1));
        header.setSerializer(buffer.getByte(2));
        header.setType(buffer.getByte(3));
        header.setStatus(buffer.getByte(4));
        header.setRequestId(buffer.getLong(5));
        header.setBodyLength(buffer.getInt(13));
        // 解决粘包问题，只读取指定长度的数据
        byte[] bodyBytes = buffer.getBytes(17, 17 + header.getBodyLength());
        ProtocolMessageSerializerEnum serializerEnum = ProtocolMessageSerializerEnum.getEnumByKey(header.getSerializer());
        if (serializerEnum == null) {
            throw new RuntimeException("序列化消息协议不存在！");
        }
        Serializer serializer = SerializerFactory.getInstance(serializerEnum.getValue());
        ProtocolMessageTypeEnum messageTypeEnum = ProtocolMessageTypeEnum.getEnumByType(header.getType());
        if (messageTypeEnum == null) {
            throw new RuntimeException("序列化消息类型不存在！");
        }
        switch (messageTypeEnum) {
            case REQUEST -> {
                RpcRequest request = serializer.deserialize(bodyBytes, RpcRequest.class);
                return new ProtocolMessage<>(header,request);
            }
            case RESPONSE -> {
                RpcResponse response = serializer.deserialize(bodyBytes, RpcResponse.class);
                return new ProtocolMessage<>(header,response);
            }
            // TODO 这里先返回null
            case HEART_BEAT, OTHERS -> {
                return null;
            }
            default -> throw new RuntimeException("暂不支持该消息类型！");
        }
    }
}
```


`ProtocolMessageEncoder`


编码器


```java
public class ProtocolMessageEncoder {
    public static Buffer encode(ProtocolMessage<?> protocolMessage) throws IOException {
        if (protocolMessage == null || protocolMessage.getHeader() == null) {
            return Buffer.buffer();
        }
        ProtocolMessage.Header header = protocolMessage.getHeader();
        Buffer buffer = Buffer.buffer();
        buffer.appendByte(header.getMagic());
        buffer.appendByte(header.getVersion());
        buffer.appendByte(header.getSerializer());
        buffer.appendByte(header.getType());
        buffer.appendByte(header.getStatus());
        buffer.appendLong(header.getRequestId());
        ProtocolMessageSerializerEnum serializerEnum = ProtocolMessageSerializerEnum.getEnumByKey(header.getSerializer());
        if (serializerEnum == null) {
            throw new RuntimeException("序列化协议不存在！");
        }
        Serializer serializer = SerializerFactory.getInstance(serializerEnum.getValue());
        byte[] bodyBytes = serializer.serialize(protocolMessage.getBody());
        buffer.appendInt(bodyBytes.length);
        buffer.appendBytes(bodyBytes);
        return buffer;
    }
}
```


### 服务端代码


创建`com.xiang.server.tcp`包，服务端的核心类基本上在此包中创建


类似Http协议下的实现，TCP下的实现也需要一个`VertxTcpServer`和一个`TcpServerHandler`。


前者作为启动Server端的入口，而后者作为Server端处理请求的handler


`VertxTcpServer`


```java
@Slf4j
public class VertxTcpServer implements Server {

    @Override
    public void doStart(int port) {
        Vertx vertx = Vertx.vertx();
        NetServer server = vertx.createNetServer();
        server.connectHandler(new TcpServerHandler());
        server.listen(port,result -> {
            if (result.succeeded()) {
                log.info("TCP服务器在端口{}上启动成功",port);
            } else {
                log.info("TCP服务器启动失败：{}",result.cause().toString());
            }
        });
    }
}
```


和VertxHttpServer类似，VertxTcpServer依然实现Server接口。


这个类很简单，在doStart方法中，创建一个`NetServer`并设置`TcpServerHandler`类作为请求的处理器，然后启动监听。


`TcpServerHandler`


```java
public class TcpServerHandler implements Handler<NetSocket> {
    @Override
    public void handle(NetSocket socket) {

        //处理连接
        netSocket.handler(buffer -> {
            //接受请求，解码
            ProtocolMessage<RpcRequest> protocolMessage;
            try {
                protocolMessage = (ProtocolMessage<RpcRequest>) ProtocolMessageDecoder.decode(buffer);
            } catch (IOException e) {
                throw new RuntimeException("协议消息解码错误");
            }
            RpcRequest rpcRequest = protocolMessage.getBody();

            //处理请求
            //构造响应结果对象
            RpcResponse rpcResponse = new RpcResponse();
            try {
                //获取要调用的服务实现类，通过反射调用
                Class<?> implClass = LocalRegistry.get(rpcRequest.getServiceName());
                Method method = implClass.getMethod(rpcRequest.getMethodName(), rpcRequest.getParameterTypes());
                Object result = method.invoke(implClass.newInstance(), rpcRequest.getArgs());
                //封装返回结果
                rpcResponse.setData(result);
                rpcResponse.setDataType(method.getReturnType());
                rpcResponse.setMessage("ok");
            } catch (Exception e) {
                e.printStackTrace();
                rpcResponse.setMessage(e.getMessage());
                rpcResponse.setException(e);
            }

            //发送响应，编码
            ProtocolMessage.Header header = protocolMessage.getHeader();
            header.setType((byte) ProtocolMessageTypeEnum.RESPONSE.getKey());
            ProtocolMessage<RpcResponse> responseProtocolMessage = new ProtocolMessage<>(header, rpcResponse);
            try {
                Buffer encode = ProtocolMessageEncoder.encode(responseProtocolMessage);
                socket.write(encode);
            } catch (IOException e) {
                throw new RuntimeException("协议消息编码错误");
            }
        });
    }
}
```


到此为止，服务端代码基本编写完成。但是，**真的没有问题吗**？


### 半包/粘包问题


当我们使用客户端向服务端连续发送很多次“hello，Sardinary”的时候，我们会发现有的时候服务端接收到的字符串不完整，有的时候接收到的字符串又比正常多了一部分，这就发生了TCP传输过程中的半包/粘包现象。


半包和粘包现在只在TCP传输的过程中才会出现，UDP中不会出现这种情况。

1. TCP的包没有报文长度，是面向流的，数据之间没有界限。
2. TCP有发送缓冲区的概念，假设一次传输的数据大小超过发送缓冲区的大小，那么完整的报文可能被拆分成两个或更多的小报文，就会出现半包的情况；如果TCP一次传输的数据大小小于发送缓冲区，那么可能会跟别的报文合并起来一块发送，这就是粘包。

> ❓ 如何解决？

- 定长报文
	- 传输固定长度的报文，如果不足规定的长度就使用空字符填充
	- 简单，但是不易于扩展，会导致空间浪费
	- Netty 中的实现就是 FixedLengthFrameDecoder，这个类来实现固定长度的解码。
- 使用分隔符来切分TCP流。
	- 识别到分隔符的时候说明数据完整了，开始解析前面的数据
	- 缺点是需要对内容本身进行处理，防止内容内出现分隔符，这样就会导致错乱，所以需要扫描一遍传输的数据将其转义，或者可以用 base64 编码数据，用 64 个之外的字符作为分隔符即可。
	- Redis就使用换行符来分隔
	- Netty 中的实现就是 DelimiterBasedFrameDecoder
- 保存消息长度
	- 规定固定的一段数据来保存消息体的长度
	- 每次解析根据保存的消息体的长度来读取，保证数据的完整性
	- 优点是可以根据固定字段精准定位，也不用扫描转义字符。
	- 缺点是固定长度字段的设计比较困难，大了浪费空间，毕竟每个报文都带这个长度，小了可能不够用
	- Netty 中的实现就是 LengthFieldBasedFrameDecoder
	- 这也是我们使用的方法

有了方法论，我们就可以实践来解决半包粘包的问题。


在`ProtocolMessageDecoder`中，我们在解码的时候已经设计读取指定长度的数据。


```java
// 解决粘包问题，只读取指定长度的数据
byte[] bodyBytes = buffer.getBytes(17, 17 + header.getBodyLength());
```


在Vert.x框架中，内置了**RecordParser**， 可以保证下次**读取到特定长度的字符。**


```java
 	//创建 Vert.x 实例
  Vertx vertx = Vertx.vertx();

  //创建 TCP 服务器
  NetServer server = vertx.createNetServer();

  //处理请求
  server.connectHandler(socket -> {
    String testMessage = "Hello,server!Hello,server!Hello,server!"
    int messageLength = testMessage.getBytes().length;
              
    //构造parser
    RecordParser parser = RecordParser.newFixed(messageLength);//每次读取固定值长度的内容
    parser.setOutput(new Handler<Buffer>() {

          @Override
          public void handle(Buffer buffer) {
              String str = new String(buffer.getBytes());
              System.out.println(str);
              if (testMessage.equals(str)) {
                  System.out.println("good");
              }
          }
      });
       
      socket.handler(parser);
  });

  //启动 TCP 服务器并监听指定端口
  server.listen(port, result ->{
      if (result.succeeded()){
          log.info("TCP server started on port "+ port);
      }else {
          log.info("Failed to start TCP server: "+ result.cause());
      }
  });
 
```


这段示例构造了一个读取固定长度`messageLength`的RecordParser，并且在setOutput函数中传入了一个匿名对Buffer的处理器，重写了handle方法，规定了对buffer流的具体处理逻辑。一旦有请求传入，就会按照handle方法中的处理逻辑处理buffer。


经过测试这段示例，发现解决了上述问题。但是，这段示例强行规定了每次读取固定长度的内容，而我们的请求体的长度并不是一成不变的。


结合之前设置请求头的时候保存了请求体的长度，我们可以使用一种巧妙的读取思路：

- 由于每次请求体大小可能不同，则不能固定RecordParser读取的长度，于是设置一个变量size，初始化为-1，RecordParser初始化为读取请求头的长度。
- 当size为-1的时候，说明为第一次读取，此时RecordParser读取请求头，当读取到头中写入的体的长度，会赋值给size，然后设置RecordParser下一次读取size长度的信息，最后将读取的请求头写入到resultBuffer中。
- 因此下一次读取则会恰好读取完整的请求体的长度，并将体信息写入resultBuffer。
- 最后，重置三个变量，以进行下一轮的读取

代码实现：


```java
RecordParser parser = RecordParser.newFixed(ProtocolConstant.MESSAGE_HEADER_LENGTH);
parser.setOutput(new Handler<Buffer>() {
    // 初始化size
    int size = -1;
    Buffer resultBuffer = Buffer.buffer();
    @Override
    public void handle(Buffer buffer) {
        if (-1 == size) {
            // 如果size为-1，说明还未读取请求头
            // 则读取请求头中的请求体长度，并赋值给size，然后改变parser读取的长度，保证完整读取请求体
            size = buffer.getInt(13);
            parser.fixedSizeMode(size);
            // 写入头信息到结果
            resultBuffer.appendBuffer(buffer);
        } else {
            // 此时读取的是请求体信息
            // 将体信息写入到结果
            resultBuffer.appendBuffer(buffer);
            // 此时已经拼接完完整的buffer，执行处理
            bufferHandler.handle(resultBuffer);

            // 重置三个变量，下一轮继续
            parser.fixedSizeMode(ProtocolConstant.MESSAGE_HEADER_LENGTH);
            size = -1;
            resultBuffer = Buffer.buffer();
        }
    }
});
```


> ❓ 如何将这段代码优雅地加入到我们原先的代码中？


很容易想到，在一次请求的恩怨情仇中，服务端需要接收客户端传来的Request的流，客户端也要接收服务端传来的Response流。因此，这段避免半包粘包的代码，在两端都需要使用。直接添加在代码中可能很方便，但是并不是一种优雅的可复用的做法。


因此，我们使用装饰器模式，将处理buffer流半包粘包功能写成一个wrapper。



`TcpBufferHandlerWrapper`


```java
/**
 * 装饰器模式，使用recordParser对原有buffer处理能力进行增强，解决半包粘包问题
 * 粘包：连续给对端发送两个或两个以上的数据包，对端在一次收取时可能收到的数据包大于一个，即可能是一个包和另一个包一部分的结合，或者是两个完整的数据包头尾相连。
 * 半包：一次收取到的数据只是其中一个包的一部分。
 */
public class TcpBufferHandlerWrapper implements Handler<Buffer> {
    private final RecordParser recordParser;
    public TcpBufferHandlerWrapper(Handler<Buffer> bufferHandler) {
        recordParser = initRecordParser(bufferHandler);
    }

    private RecordParser initRecordParser(Handler<Buffer> bufferHandler) {
        /* 读取思路：
                由于每次请求体大小可能不同，则不能固定RecordParser读取的长度，
                于是设置一个变量size，初始化为-1，RecordParser初始化为读取请求头的长度。
                当size为-1的时候，说明为第一次读取，此时RecordParser读取请求头，
                当读取到头中写入的体的长度，会赋值给size，然后设置RecordParser下一次读取size长度的信息，最后将读取的请求头写入到resultBuffer中。
                因此下一次读取则会恰好读取完整的请求体的长度，并将体信息写入resultBuffer。
                最后，重置三个变量，以进行下一轮的读取
         */
        RecordParser parser = RecordParser.newFixed(ProtocolConstant.MESSAGE_HEADER_LENGTH);
        parser.setOutput(new Handler<Buffer>() {
            // 初始化size
            int size = -1;
            Buffer resultBuffer = Buffer.buffer();
            @Override
            public void handle(Buffer buffer) {
                if (-1 == size) {
                    // 如果size为-1，说明还未读取请求头
                    // 则读取请求头中的请求体长度，并赋值给size，然后改变parser读取的长度，保证完整读取请求体
                    size = buffer.getInt(13);
                    parser.fixedSizeMode(size);
                    // 写入头信息到结果
                    resultBuffer.appendBuffer(buffer);
                } else {
                    // 此时读取的是请求体信息
                    // 将体信息写入到结果
                    resultBuffer.appendBuffer(buffer);
                    // 此时已经拼接完完整的buffer，执行处理
                    bufferHandler.handle(resultBuffer);

                    // 重置三个变量，下一轮继续
                    parser.fixedSizeMode(ProtocolConstant.MESSAGE_HEADER_LENGTH);
                    size = -1;
                    resultBuffer = Buffer.buffer();
                }
            }
        });
        return parser;
    }

    @Override
    public void handle(Buffer buffer) {
        recordParser.handle(buffer);
    }
}

```


同样也要修改`TcpServerHandler`中的代码


```java
public class TcpServerHandler implements Handler<NetSocket> {
    @Override
    public void handle(NetSocket netSocket) {
		    //这里使用装饰器
        TcpBufferHandlerWrapper bufferHandlerWrapper = new TcpBufferHandlerWrapper(buffer -> {
            // 接受请求，对请求解码
            ProtocolMessage<RpcRequest> protocolMessage;
            try {
                protocolMessage = (ProtocolMessage<RpcRequest>) ProtocolMessageDecoder.decode(buffer);
            } catch (IOException e) {
                throw new RuntimeException("协议消息解码错误！");
            }
            RpcRequest rpcRequest = protocolMessage.getBody();

            // 处理请求，构造响应结果
            RpcResponse rpcResponse = new RpcResponse();
            try {
                Class<?> implClass = LocalRegister.getService(rpcRequest.getServiceName());
                Method method = implClass.getMethod(rpcRequest.getMethodName(), rpcRequest.getParameterTypes());
                Object result = method.invoke(implClass.newInstance(), rpcRequest.getArgs());
                rpcResponse.setData(result);
                rpcResponse.setDataType(method.getReturnType());
                rpcResponse.setMessage("OK");
            } catch (Exception e) {
                e.printStackTrace();
                rpcResponse.setMessage(e.getMessage());
                rpcResponse.setException(e);
            }

            // 对response编码并发送
            ProtocolMessage.Header header = protocolMessage.getHeader();
            header.setType(((byte) ProtocolMessageTypeEnum.RESPONSE.getKey()));
            ProtocolMessage<RpcResponse> rpcResponseProtocolMessage = new ProtocolMessage<>(header, rpcResponse);
            try {
                Buffer encode = ProtocolMessageEncoder.encode(rpcResponseProtocolMessage);
                netSocket.write(encode);
            } catch (IOException e) {
                throw new RuntimeException("协议消息编码错误！");
            }
        });
        // 设置wrapper为处理器
        netSocket.handler(bufferHandlerWrapper);
    }
}

```


> ❓ 代码的执行逻辑？


这一部分代码`TcpServerHandler`、`TcpBufferHandlerWrapper` 较为复杂，大量使用的Lambda表达式（匿名函数）的形式，并且不太容易debug，因此可能对这段代码的执行顺序较为模糊。这里我来详细说明一下代码的执行逻辑。


从服务端`server.connectHandler(new TcpServerHandler())`这行代码开始说起    


![Untitled.png](/images/379dd3f846b74e789ea44fb1589939a4.png)


1. 执行server.connectHandler(new TcpServerHandler())，设置TcpServerHandler为处理请求的handler    


2. 当有请求到来时：        


	2.1 执行TcpServerHandler类的handle方法            


		2.1.1                


			2.1.1.1 先是new一个TcpBufferHandlerWrapper，参数为一个Handler<Buffer>，使用lambda的形式传入一个新的Handler<Buffer>，大括号内为该Handler<Buffer>的handle方法的具体逻辑                


			2.1.1.2 同时执行TcpBufferHandlerWrapper的initRecordParser(bufferHandler)方法，初始化RecordParser recordParser。在initRecordParser方法中的parser.setOutput语句中实现了RecordParser的handle方法            


		2.1.2 执行netSocket.handler(bufferHandlerWrapper)，设置数据处理器。即当请求到来时，bufferHandlerWrapper的handle方法会被调用        


	2.2 执行TcpBufferHandlerWrapper类的handle方法            


		2.2.1 执行handle方法的recordParser.handle(buffer);语句，进入到recordParser的handle方法


	2.3 执行recordParser的handle方法            


		2.3.1 执行2.1.1.2中实现的RecordParser的handle方法            


		2.3.2 buffer处理完毕后，执行bufferHandler.handle(resultBuffer)。此处的bufferHandler就是initRecordParser方法的入参，也是TcpBufferHandlerWrapper构造函数的入参，即2.1.1.1中传入的Handler<Buffer>，于是执行2.1.1.1中lambda大括号内的逻辑       


	2.4 执行Handler<Buffer>的handle方法


以上就是服务端代码的执行顺序。


> 🥲 什么，文字太多太乱不直观？好吧，下面是这段代码的执行图解。


![Untitled.png](/images/bbfbb7b1a7e020b080da6e474ea65073.png)


### 客户端代码


客户端端代码主要分为两个部分：

1. 我们要封装一个类`VertxTcpClient`来实现客户端使用TCP发送请求和接收响应的逻辑
2. 在我们的老朋友`ServiceProxy`中调用`VertxTcpClient`，实现从Http向TCP的转换

`VertxTcpClient`


```java
@Slf4j
public class VertxTcpClient {
    public static RpcResponse doRequest(RpcRequest rpcRequest, ServiceMetaInfo selectedServiceMetaInfo) throws ExecutionException, InterruptedException, TimeoutException {
        Vertx vertx = Vertx.vertx();
        NetClient netClient = vertx.createNetClient();
        CompletableFuture<RpcResponse> responseFuture = new CompletableFuture<>();
        netClient.connect(selectedServiceMetaInfo.getServicePort(),selectedServiceMetaInfo.getServiceHost(),rst -> {
            if (!rst.succeeded()) {
                log.error("连接TCP服务器失败");
                return;
            }
            log.info("连接到TCP服务器");
            NetSocket socket = rst.result();
            ProtocolMessage<RpcRequest> protocolMessage = new ProtocolMessage<>();
            ProtocolMessage.Header header = new ProtocolMessage.Header();
            header.setMagic(ProtocolConstant.PROTOCOL_MAGIC);
            header.setVersion(ProtocolConstant.PROTOCOL_VERSION);
            header.setSerializer(((byte) ProtocolMessageSerializerEnum.getEnumByValue(RpcApplication.getRpcConfig().getSerializer()).getKey()));
            header.setType(((byte) ProtocolMessageTypeEnum.REQUEST.getKey()));
            header.setRequestId(IdUtil.getSnowflakeNextId());
            protocolMessage.setHeader(header);
            protocolMessage.setBody(rpcRequest);

            try {
                Buffer encode = ProtocolMessageEncoder.encode(protocolMessage);
                socket.write(encode);
            } catch (IOException e) {
                throw new RuntimeException("协议消息编码错误");
            }
            // 使用wrapper作为处理器
            TcpBufferHandlerWrapper bufferHandlerWrapper = new TcpBufferHandlerWrapper(buffer -> {
                ProtocolMessage<RpcResponse> rpcResponseProtocolMessage = null;
                try {
                    rpcResponseProtocolMessage = (ProtocolMessage<RpcResponse>) ProtocolMessageDecoder.decode(buffer);
                    // 这里响应返回后将异步任务设置为完成
                    responseFuture.complete(rpcResponseProtocolMessage.getBody());
                } catch (IOException e) {
                    throw new RuntimeException("协议消息解码错误");
                }
            });
            socket.handler(bufferHandlerWrapper);

        });
        // get方法将阻塞直到complete方法被调用，即得到响应之后才会继续下面的代码
        RpcResponse rpcResponse = responseFuture.get();
        netClient.close();
        return rpcResponse;
    }
}
```


注意到，这段代码使用到了`CompletableFuture`，对于发送请求得到响应这件事做了异步处理。


定义完connect方法中连接到服务器之后的处理逻辑（即lambda中定义的逻辑）后，代码被阻塞到`responseFuture.get()`，直到有请求发出，lambda中的逻辑才会被调用，且执行到`responseFuture.complete(rpcResponseProtocolMessage.getBody())`之后（即调用成功），get方法不再阻塞，才会进行后面的逻辑。


但是，lambda中的逻辑执行失败了会怎么样？会一直阻塞在get方法动弹不得吗？异步任务中的异常处理可以直接抛出异常吗？哈哈，这里先留个伏笔。


接下来就是在`ServiceProxy`调用就好。


```java
@Slf4j
public class ServiceProxy implements InvocationHandler {
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
//        final Serializer serializer = SerializerFactory.getInstance(RpcApplication.getRpcConfig().getSerializer());;
        RpcRequest rpcRequest = RpcRequest
                .builder()
                .serviceName(method.getDeclaringClass().getName())
                .methodName(method.getName())
                .parameterTypes(method.getParameterTypes())
                .args(args)
                .build();

        Registry registry = RegistryFactory.getInstance(RpcApplication.getRpcConfig().getRegistryConfig().getRegistry());
        ServiceMetaInfo serviceMetaInfo = new ServiceMetaInfo()
                .setServiceName(method.getDeclaringClass().getName())
                .setServiceVersion(RpcConstant.DEFAULT_SERVICE_VERSION);
        List<ServiceMetaInfo> serviceMetaInfoList = registry.serviceDiscovery(serviceMetaInfo.getServiceKey());
        if (CollUtil.isEmpty(serviceMetaInfoList)) {
            throw new RuntimeException("暂无服务地址！");
        }
        // 这里先取第一个
        ServiceMetaInfo selectedServiceMetaInfo = serviceMetaInfoList.get(0);

        // 发送tcp请求
        // 将发送请求具体逻辑封装在VertxTcpClient的doRequest方法
        RpcResponse rpcResponse = null;
        try {
            rpcResponse = VertxTcpClient.doRequest(rpcRequest, selectedServiceMetaInfo);

             /*
            // 发送http请求
            try (HttpResponse httpResponse = HttpRequest
                         .post(selectedServiceMetaInfo.getServiceAddress())
                         .body(bodyBytes)
                         .execute()
            ) {
                byte[] result = httpResponse.bodyBytes();
                RpcResponse rpcResponse = serializer.deserialize(result, RpcResponse.class);
                return rpcResponse.getData();
            }
             */
        } catch (Exception e) {
            throw new RuntimeException("调用失败");
        }
        return rpcResponse.getData();
    }
}
```


> 👏 **至此，我们的自定义协议基本完成 🎉**


参考：


[bookmark](https://www.51cto.com/article/709597.html)


# 负载均衡


> `ServiceMetaInfo selectedServiceMetaInfo = serviceMetaInfoList.get(0)`这行代码一直不改，我就一直难受


在学习SpringCloud的时候，我第一次遇见了负载均衡这个词语，也深刻地认识到了负载均衡对于服务可靠性和健壮性的影响之大。


此时此刻，熟悉的声音萦绕耳畔😭


> 😭回来吧负载均衡😭  
> 🌟我最骄傲的信仰🌟  
> ❤️‍🩹历历在目的`LoadBalance`❤️‍🩹  
> 😭眼泪莫名在流淌😭  
> 💥依稀记得`Ribbon`💥  
> 👍还有给力的策略👍  
> 😋把Server都给分配😋  
> ✨流量再大都不累✨


正如`get(0)`这行代码，目前我们的RPC框架仅允许消费者读取第一个服务提供者的服务节点，但在实际应用中，同一个服务会有多个服务提供者上传节点信息。如果消费者只读取第一个，势必会增大单个节点的压力，并且也浪费了其它节点资源。因此，我们迫切需要负载均衡的改造。


## 负载均衡策略

- **轮询（Round Robin）**：轮询策略按照顺序将每个新的请求分发给后端服务器，依次循环。这是一种最简单的负载均衡策略，适用于后端服务器的性能相近，且每个请求的处理时间大致相同的情况。
- **随机选择（Random）**：随机选择策略随机选择一个后端服务器来处理每个新的请求。这种策略适用于后端服务器性能相似，且每个请求的处理时间相近的情况，但不保证请求的分发是均匀的。
- **最少连接（Least Connections）**：最少连接策略将请求分发给当前连接数最少的后端服务器。这可以确保负载均衡在后端服务器的连接负载上均衡，但需要维护连接计数。
- **加权轮询（Weighted Round Robin）**：加权轮询策略给每个后端服务器分配一个权重值，然后按照权重值比例来分发请求。这可以用来处理后端服务器性能不均衡的情况，将更多的请求分发给性能更高的服务器。
- **加权随机选择（Weighted Random）**：加权随机选择策略与加权轮询类似，但是按照权重值来随机选择后端服务器。这也可以用来处理后端服务器性能不均衡的情况，但是分发更随机。
- **最短响应时间（Least Response Time）**：最短响应时间策略会测量每个后端服务器的响应时间，并将请求发送到响应时间最短的服务器。这种策略可以确保客户端获得最快的响应，适用于要求低延迟的应用。
- **IP 哈希（IP Hash）**：IP 哈希策略使用客户端的 IP 地址来计算哈希值，然后将请求发送到与哈希值对应的后端服务器。这种策略可用于确保来自同一客户端的请求都被发送到同一台后端服务器，适用于需要会话保持的情况。
	- [**一致性哈希（Consistent Hashing）**](https://blog.csdn.net/a745233700/article/details/120814088)：将整个哈希值空间划分成一个环状结构，每个节点或服务器在环上占据一个位置，每个请求根据其哈希值映射到环上的一个点，然后顺时针寻找第一个遇见的节点，将请求路由到该节点上。
		- 优点：
			1. 同一hash参数的客户端每次都会分配到同一个服务器节点，有利于用户体验的连续性
			2. 节点下线：某个节点下线后，其负载会被平均分摊到其它节点上，不会影响到整个系统的稳定性，只会产生局部变动。
			3. 倾斜问题：如果服务节点在哈希环上分布不均匀，可能会导致大部分请求全都集中在某一台服务器上，造成数据分布不均匀。通过引入虚拟节点，对每个服务节点计算多个哈希，每个计算结果位置都放置该服务节点，即一个实际物理节点对应多个虚拟节点，使得**请求能够被均匀分布**，减少节点间的负载差异。

## 实现


在我们的项目中，实现轮询、随机和一致性哈希这三种策略，以及通过SPI机制实现扩展



_`LoadBalancer`_


负载均衡器接口


```java
public interface LoadBalancer {
    ServiceMetaInfo select(Map<String,Object> requestParams, List<ServiceMetaInfo> serviceMetaInfoList);
}
```



`RoundRobinLoadBalancer`


```java
/**
 * 轮询的负载均衡器
 */
public class RoundRobinLoadBalancer implements LoadBalancer {
    private final AtomicInteger currentIndex = new AtomicInteger(0);
    @Override
    public ServiceMetaInfo select(Map<String, Object> requestParams, List<ServiceMetaInfo> serviceMetaInfoList) {
        if (serviceMetaInfoList.isEmpty()) {
            return null;
        }
        int size = serviceMetaInfoList.size();
        if (size == 1) {
            return serviceMetaInfoList.get(0);
        }
        int index = currentIndex.getAndIncrement() % size;
        return serviceMetaInfoList.get(index);
    }
}

```


这里使用了`AtomicInteger`原子类。关于原子类可以看我另一篇博客：


[embed](https://sardinaryblog.vercel.app/12f90912990f4a25b19cc9fa024e3cea)



`RandomLoadBalancer`


```java
/**
 * 随机负载均衡器
 */
public class RandomLoadBalancer implements LoadBalancer {
    private final Random random = new Random();
    @Override
    public ServiceMetaInfo select(Map<String, Object> requestParams, List<ServiceMetaInfo> serviceMetaInfoList) {
        int size = serviceMetaInfoList.size();
        if (size == 0) {
            return null;
        }
        if (size == 1) {
            return serviceMetaInfoList.get(0);
        }
        return serviceMetaInfoList.get(random.nextInt(size));
    }
}

```



`ConsistentHashLoadBalancer`


```java
/**
 * 一致性哈希负载均衡器
 */
public class ConsistentHashLoadBalancer implements LoadBalancer {
    // 一致性hash环，存放虚拟节点
    private final TreeMap<Integer,ServiceMetaInfo> virtualNodes = new TreeMap<>();
    // 设置100个虚拟节点
    private static final int VIRTUAL_NODE_NUM = 100;
    @Override
    public ServiceMetaInfo select(Map<String, Object> requestParams, List<ServiceMetaInfo> serviceMetaInfoList) {
        if (serviceMetaInfoList.isEmpty()) {
            return null;
        }
        // 每一个节点衍生出100个虚拟节点，存放在hash环中
        for (ServiceMetaInfo serviceMetaInfo : serviceMetaInfoList) {
            for (int i = 0; i < VIRTUAL_NODE_NUM; i++) {
                int hash = getHash(serviceMetaInfo.getServiceAddress() + "#" + i);
                virtualNodes.put(hash,serviceMetaInfo);
            }
        }
        // 获得请求参数的hash值
        int hash = getHash(requestParams);
        // 选择最接近且大于等于请求参数hash值的虚拟节点
        Map.Entry<Integer, ServiceMetaInfo> entry = virtualNodes.ceilingEntry(hash);
        if (entry == null) {
            // 如果不存在，则返回第一个节点（因为是环）
            entry = virtualNodes.firstEntry();
        }
        return entry.getValue();
    }

    private int getHash(Object key) {
        return key.hashCode();
    }
}
```


接下来通过SPI机制实现负载均衡策略的扩展
`LoadBalancerFactory`


```java
public class LoadBalancerFactory {
    static {
        SpiLoader.load(LoadBalancer.class);
    }
    // 默认负载均衡器是轮询
    private static final LoadBalancer DEFAULT_LOAD_BALANCER = new RoundRobinLoadBalancer();

    public static LoadBalancer getInstance(String key) {
        return SpiLoader.getInstance(LoadBalancer.class,key);
    }
}
```


在`SpiLoader`类的`LOAD_CLASS_LIST`加入


```java
    /**
     * 需要加载的spi接口集合，这里只有序列化接口
     */
    private static final List<Class<?>> LOAD_CLASS_LIST = List.of(
            Serializer.class,
            Registry.class,
            LoadBalancer.class
    );
```


在`RpcConfig`类加入负载均衡配置


```java
@Data
public class RpcConfig {
    private String name = "xy-rpc";
    private String version = "1.0.0";
    private String serverHost = "localhost";
    private String serverPort = "8080";
    // mock功能，默认为false
    private Boolean mock = false;
    private String serializer = SerializerKeys.JDK;
    // 配置中心配置
    private RegistryConfig registryConfig = new RegistryConfig();
    private String loadBalancer = LoadBalancerKeys.ROUND_ROBIN;

}
```


在`src/main/resources/META-INF/rpc/system/`创建配置文件`com.xiang.loadbalancer.LoadBalancer`，注册负载均衡器


```text
roundRobin=com.xiang.loadbalancer.RoundRobinLoadBalancer
random=com.xiang.loadbalancer.RandomLoadBalancer
consistentHash=com.xiang.loadbalancer.ConsistentHashLoadBalancer
```


最后一步，在`ServiceProxy`中调用负载均衡器


```java
@Slf4j
public class ServiceProxy implements InvocationHandler {
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        RpcRequest rpcRequest = RpcRequest
                .builder()
                .serviceName(method.getDeclaringClass().getName())
                .methodName(method.getName())
                .parameterTypes(method.getParameterTypes())
                .args(args)
                .build();

        Registry registry = RegistryFactory.getInstance(RpcApplication.getRpcConfig().getRegistryConfig().getRegistry());
        ServiceMetaInfo serviceMetaInfo = new ServiceMetaInfo()
                .setServiceName(method.getDeclaringClass().getName())
                .setServiceVersion(RpcConstant.DEFAULT_SERVICE_VERSION);
        List<ServiceMetaInfo> serviceMetaInfoList = registry.serviceDiscovery(serviceMetaInfo.getServiceKey());
        if (CollUtil.isEmpty(serviceMetaInfoList)) {
            throw new RuntimeException("暂无服务地址！");
        }
        // 负载均衡获得服务节点
        LoadBalancer loadBalancer = LoadBalancerFactory.getInstance(RpcApplication.getRpcConfig().getLoadBalancer());
        Map<String, Object> requestParams = new HashMap<>();
        // 这里将要调用的方法名作为负载均衡参数
        requestParams.put("methodName",rpcRequest.getMethodName());
        ServiceMetaInfo selectedServiceMetaInfo = loadBalancer.select(requestParams, serviceMetaInfoList);

        // 发送tcp请求
        // 将发送请求具体逻辑封装在VertxTcpClient的doRequest方法
        RpcResponse rpcResponse = null;
        try {
            rpcResponse = VertxTcpClient.doRequest(rpcRequest, selectedServiceMetaInfo);

             /*
            // 发送http请求
            try (HttpResponse httpResponse = HttpRequest
                         .post(selectedServiceMetaInfo.getServiceAddress())
                         .body(bodyBytes)
                         .execute()
            ) {
                byte[] result = httpResponse.bodyBytes();
                RpcResponse rpcResponse = serializer.deserialize(result, RpcResponse.class);
                return rpcResponse.getData();
            }
             */
        } catch (Exception e) {
            throw new RuntimeException("调用失败");
        }
        return rpcResponse.getData();
    }
}
```


# 重试机制


在我们目前的设计中，遇到异常我们都是直接抛出，所以消费者调用失败后就会直接报错，这就导致我们的系统可用性不够高，消费者一次调用失败就不会再进行尝试。为什么不给消费者多一些机会呢？我们希望消费者拥有自动重试的能力，在一次失败后可以进行多次尝试，提高系统的可用性。


## 关于重试


### **为什么需要重试机制**

- 提高系统可用性可靠性：当远程服务调用失败，重试机制可以让系统自动重新发送请求，保证接口的调用执行。
- 有效处理临时性错误：重试机制能够有效缓解如网络延迟、连接异常等临时性错误的影响，提高调用成功率。
- 降低调用端复杂性：重试机制将捕获异常并触发重试的逻辑封装在框架内部，无需手动操作。

### 重要参数

- 重试次数：如果对重试次数不加限制，在出现下游系统故障，或者恰好命中下游系统bug的情况下，可能出现在相当一段时间内的重试都会以失败告终，这时候的重试不仅没有起到提升对外服务质量的效果，反而会对当前服务和下游服务都造成非常大的不必要负荷
- 调用间隔：两次调用之间的调用间隔时长，主要体现在退避策略中
- 超时时间：整体的请求耗时（包括首次请求以及后续的重试请求的整体耗时）如果超过了超时时间就会放弃本次调用，不会再继续重试

### 重试策略

1. 无退避重试：立即重试
2. 固定间隔重试（Fixed Interval Retry）：
	- 每次重试间隔一个固定时间，如 1 秒。
	- 适用于对响应时间要求不严格的场景。
3. 指数退避重试（Exponential Backoff Retry）：
	- 每次重试间隔的时间呈指数增长，如 1 秒、2 秒、4 秒、8 秒等。
	- 适用于网络波动较大的场景，避免短时间内发送大量重复请求。
4. 随机延迟重试（Random Delay Retry）：
	- 每次重试的时间间隔随机，在一定范围内波动。
	- 适用于避免重试请求同步的场景，比如防止雪崩效应。
5. 可变延迟重试（Variable Delay Retry）：
	- 根据先前重试的成功或失败情况，动态调整下一次重试的延迟时间。
6. 不重试（No Retry）：
	- 直接返回失败结果，不重试。
	- 适用于对响应时间要求较高的场景。
7. 综合退避重试：组合上述策略。例如先使用指数退避重试，如果连续多次重试失败，则切换到固定间隔重试策略。

### 重试触发


即什么情况下会触发重试机制。


RocketMQ：消息发送失败会自动重试。消息消费阶段也会自动重试，消费失败的消息进入死信队列。


Dubbo：

- 默认重试次数为3（包括第一次请求），配置大于1时才会触发重试
- 默认是 Failover 策略，所以重试不会重试当前节点，只会重试（可用节点 -> 负载均衡 ->路由之后的）下一个节点
- TCP 握手超时会触发重试
- 响应超时会触发重试
- 报文错误或其他错误导致无法找到对应的 request，也会导致 Future 超时，超时就会重试
- 对于服务端返回的 Exception（比如provider抛出的），属于调用成功，不会进行重试

## **预计功能**

- 调用方发起请求失败时，RPC框架可以自动重试
- 自动重试功能可选择开启和关闭
- 自动重试最大次数可以调节
- 可以选择和自定义合适的重试算法

## 实现


> ⚠️ 从这部分开始往后不再赘述SPI机制实现自定义扩展！那套丝滑小连招请参考序列化器！


使用Guava-Retrying 重试库


```xml
 <dependency>
     <groupId>com.github.rholder</groupId>
     <artifactId>guava-retrying</artifactId>
     <version>2.0.0</version>
 </dependency>
```


创建接口`com.xiang.fault.retry.RetryStrategy`


```java
/**
 * 重试策略
 */
public interface RetryStrategy {
    /**
     * 重试策略的方法
     * @param callable 代表一个具体的任务
     * @return 响应对象
     * @throws Exception 抛出异常
     */
    RpcResponse doRetry(Callable<RpcResponse> callable) throws Exception;
}
```


我们的重试是针对客户端请求服务端接口的，所以这里返回值为`RpcResponse`


实现不重试策略


```java
public class NoRetryStrategy implements RetryStrategy {
    @Override
    public RpcResponse doRetry(Callable<RpcResponse> callable) throws Exception {
        return callable.call();
    }
}
```


实现固定间隔重试策略


```java
/**
 * 固定时间间隔重试
 */
@Slf4j
public class FixedIntervalRetryStrategy implements RetryStrategy {
    @Override
    public RpcResponse doRetry(Callable<RpcResponse> callable) throws Exception {
        Retryer<RpcResponse> retryer = RetryerBuilder
                .<RpcResponse>newBuilder()
                .retryIfExceptionOfType(Exception.class)
                .withWaitStrategy(WaitStrategies.fixedWait(3L, TimeUnit.SECONDS))
                .withStopStrategy(StopStrategies.stopAfterAttempt(3))
                .withRetryListener(new RetryListener() {
                    @Override
                    public <V> void onRetry(Attempt<V> attempt) {
                        log.info("重试次数{}", attempt.getAttemptNumber());
                    }
                })
                .build();
        return retryer.call(callable);
    }
}
```


这里我们设计遇到`Exception`会触发重试机制，间隔3秒重试，至多重试3次。


在`ServiceProxy`中使用重试机制


```java
RetryStrategy retryStrategy = RetryStrategyFactory.getInstance(RpcApplication.getRpcConfig().getRetryStrategy());
rpcResponse = retryStrategy.doRetry(() -> VertxTcpClient.doRequest(rpcRequest, selectedServiceMetaInfo));
```


## 还有高手？


经过我们测试，发现我们手动制造异常后并没有触发重试，并且控制台没有报相应的错误，而是代码似乎在某个地方阻塞了。


> 👏 还记得我们前面埋下的[伏笔](/c3a4551632584e9eb6afa180c0277f90#dba4caea80304fe083e7990a82464154)吗？


我们先回顾一下这段代码


```java
@Slf4j
public class VertxTcpClient {
    public static RpcResponse doRequest(RpcRequest rpcRequest, ServiceMetaInfo selectedServiceMetaInfo) throws ExecutionException, InterruptedException, TimeoutException {
        Vertx vertx = Vertx.vertx();
        NetClient netClient = vertx.createNetClient();
        CompletableFuture<RpcResponse> responseFuture = new CompletableFuture<>();
        netClient.connect(selectedServiceMetaInfo.getServicePort(),selectedServiceMetaInfo.getServiceHost(),rst -> {
            if (!rst.succeeded()) {
                log.error("连接TCP服务器失败");
                throw new RuntimeException("连接TCP服务器失败");
                return;
            }
            log.info("连接到TCP服务器");
            NetSocket socket = rst.result();
            ProtocolMessage<RpcRequest> protocolMessage = new ProtocolMessage<>();
            ProtocolMessage.Header header = new ProtocolMessage.Header();
            header.setMagic(ProtocolConstant.PROTOCOL_MAGIC);
            header.setVersion(ProtocolConstant.PROTOCOL_VERSION);
            header.setSerializer(((byte) ProtocolMessageSerializerEnum.getEnumByValue(RpcApplication.getRpcConfig().getSerializer()).getKey()));
            header.setType(((byte) ProtocolMessageTypeEnum.REQUEST.getKey()));
            header.setRequestId(IdUtil.getSnowflakeNextId());
            protocolMessage.setHeader(header);
            protocolMessage.setBody(rpcRequest);

            try {
                Buffer encode = ProtocolMessageEncoder.encode(protocolMessage);
                socket.write(encode);
            } catch (IOException e) {
                throw new RuntimeException("协议消息编码错误");
            }
            // 使用wrapper作为处理器
            TcpBufferHandlerWrapper bufferHandlerWrapper = new TcpBufferHandlerWrapper(buffer -> {
                ProtocolMessage<RpcResponse> rpcResponseProtocolMessage = null;
                try {
                    rpcResponseProtocolMessage = (ProtocolMessage<RpcResponse>) ProtocolMessageDecoder.decode(buffer);
                    // 这里响应返回后将异步任务设置为完成
                    responseFuture.complete(rpcResponseProtocolMessage.getBody());
                } catch (IOException e) {
                    throw new RuntimeException("协议消息解码错误");
                }
            });
            socket.handler(bufferHandlerWrapper);

        });
        // get方法将阻塞直到complete方法被调用，即得到响应之后才会继续下面的代码
        RpcResponse rpcResponse = responseFuture.get();
        netClient.close();
        return rpcResponse;
    }
}
```


前面我们说代码即不报错也不重试，仿佛阻塞在了某个地方，结合我们这段代码中使用的`CompletableFuture`，不难猜测到代码阻塞在了`responseFuture.get()` 这部分。


为什么代码会阻塞而不是进行失败后的重试呢？我们知道，重试机制是有触发条件的，在感受到异常才会触发重试。如果异常没有被正常抛出，重试机制感受不到异常，那么就不会触发重试机制，然后因为调用失败迟迟执行不到`responseFuture.complete`，代码自然而然地会阻塞到`get`方法处，于是就出现了前文描述的奇怪的bug。


> ❓ 为什么异常无法被正常抛出呢？我们明明在`connect`方法的Lambda部分进行了很多次try-catch，并都在catch块中捕获并手动抛出了异常。


这段代码的特殊性在于Lambda部分是一个异步调用。虽然我们写了`throw new RuntimeException`，但是异常发生在一个异步的回调函数中，而这个异常不会传播到调用者的线程上下文中去，所以异常不会被抛出。


具体来说，`netClient.connect` 的回调方法 `handler` 是由 Vert.x 异步地执行的，它运行在一个单独的线程中。如果在这个回调中抛出异常，Vert.x 会捕获异常，但不会传播到主线程或者使整个方法抛出异常。在这种情况下，抛出的 `RuntimeException` 只是影响了当前的异步处理逻辑，并不会被 `doRequest` 方法的调用者捕获。因为 `doRequest` 方法是同步的，直接抛出的异常只会影响到同步执行的代码。


> ❓ 那么如何正确地处理异步回调中的异常？


我们可以使用`responseFuture.completeExceptionally(`_`new`_ `RuntimeException("message"))` 来将异常传递到主线程。


并且，如果出现一些异常我们并没有考虑到（没有try-catch到），主线程也不会感受到，因此代码又会阻塞在get方法。为了避免这种情况，我们为get方法设置一个超时时间，超过超时时间就会抛出异常，代码将不会一直阻塞在get方法。


关于CompletableFuture正确抛出异常的扩展，可以参考这篇文章。


[bookmark](https://juejin.cn/post/7249347651786702909)


下面是改造后的代码。


```java
@Slf4j
public class VertxTcpClient {
    public static RpcResponse doRequest(RpcRequest rpcRequest, ServiceMetaInfo selectedServiceMetaInfo) throws ExecutionException, InterruptedException, TimeoutException {
        Vertx vertx = Vertx.vertx();
        NetClient netClient = vertx.createNetClient();
        CompletableFuture<RpcResponse> responseFuture = new CompletableFuture<>();
        netClient.connect(selectedServiceMetaInfo.getServicePort(),selectedServiceMetaInfo.getServiceHost(),rst -> {
            if (!rst.succeeded()) {
                log.error("连接TCP服务器失败");
                // 使用completeExceptionally将异常告诉异步任务
                // 直接throw的话异步任务不知道抛出了异常，因此会阻塞在get处
                // 且异步任务也不会向外抛出异常，因此重试机制捕获不到异常，不会重试
                responseFuture.completeExceptionally(new RuntimeException("连接TCP服务器失败"));
                return;
            }
            log.info("连接到TCP服务器");
            NetSocket socket = rst.result();
            ProtocolMessage<RpcRequest> protocolMessage = new ProtocolMessage<>();
            ProtocolMessage.Header header = new ProtocolMessage.Header();
            header.setMagic(ProtocolConstant.PROTOCOL_MAGIC);
            header.setVersion(ProtocolConstant.PROTOCOL_VERSION);
            header.setSerializer(((byte) ProtocolMessageSerializerEnum.getEnumByValue(RpcApplication.getRpcConfig().getSerializer()).getKey()));
            header.setType(((byte) ProtocolMessageTypeEnum.REQUEST.getKey()));
            header.setRequestId(IdUtil.getSnowflakeNextId());
            protocolMessage.setHeader(header);
            protocolMessage.setBody(rpcRequest);

            try {
                Buffer encode = ProtocolMessageEncoder.encode(protocolMessage);
                socket.write(encode);
            } catch (IOException e) {
                responseFuture.completeExceptionally(new RuntimeException("协议消息编码错误"));
//                throw new RuntimeException("协议消息编码错误");
            }

            TcpBufferHandlerWrapper bufferHandlerWrapper = new TcpBufferHandlerWrapper(buffer -> {
                ProtocolMessage<RpcResponse> rpcResponseProtocolMessage = null;
                try {
                    rpcResponseProtocolMessage = (ProtocolMessage<RpcResponse>) ProtocolMessageDecoder.decode(buffer);
                    // 这里响应返回后将异步任务设置为完成
                    responseFuture.complete(rpcResponseProtocolMessage.getBody());
                } catch (IOException e) {
                    responseFuture.completeExceptionally(new RuntimeException("协议消息解码错误"));
//                    throw new RuntimeException("协议消息解码错误");
                }
            });
            socket.handler(bufferHandlerWrapper);

        });
        // get方法将阻塞直到complete方法被调用，即得到响应之后才会继续下面的代码
        // 设置超时时间2s
        RpcResponse rpcResponse = responseFuture.get(2,TimeUnit.SECONDS);
        netClient.close();
        return rpcResponse;
    }
}
```


改造后再来测试，重试机制就生效了。

