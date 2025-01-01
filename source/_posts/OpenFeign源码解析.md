---
categories: 深入源码
tags:
  - OpenFeign
  - 后端
description: ''
permalink: ''
title: OpenFeign源码解析
cover: /images/ab6231a3d2f775538d50989cdb1f8a9d.png
date: '2025-01-01 17:42:00'
updated: '2025-01-01 17:49:00'
---

📹参考：


[bookmark](https://www.bilibili.com/video/BV11D4y1C73V)


📒参考：作者整理的笔记


## First

## **什么是Open Feign?**


OpenFeign 是 Spring Cloud 全家桶的组件之一， 其核心的作用是为 Rest API 提供高效简洁的 RPC 调用方式


## **搭建测试项目**


### **服务接口和实体**


### **项目名称**


cloud-feign-api


### **实体类**


```java
public class Order implements Serializable {
    private Long id;
    private String name;

    public Order() {}

    public Order(Long id, String name) {
        this.id = id;
        this.name = name;
    }
}

public class User implements Serializable {

    private Long id;
    private String name;

    public User() {}

    public User(Long id, String name) {
        this.id = id;
        this.name = name;
    }
}

public class Result <T> implements Serializable
{
    private Integer code;
    private String message;
    private T data;

    public Result(Integer code, String message, T data) {
        this.code = code;
        this.message = message;
        this.data = data;
    }

    public Result(T data) {
        this(200, "操作成功", data);
    }
}
```


### **服务提供方**


### **项目名称**


cloud-feign-server


### **依赖 (pom.xml)**


```xml
<dependencies>
  <!--实体类-->
  <dependency>
    <groupId>org.example</groupId>
    <artifactId>cloud-feign-api</artifactId>
    <version>1.0-SNAPSHOT</version>
  </dependency>

  <!-- 注册中心 nacos -->
  <dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
  </dependency>

  <!-- web -->
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
  </dependency>

  <!-- test -->
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
  </dependency>
</dependencies>
```


### **配置文件(application.yml)**


```text
server:
  port: 9001

spring:
  application:
    name: cloud-feign-server
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848 #配置Nacos地址

```


### **配置类**


无


### **启动类**


```text
@SpringBootApplication
@EnableDiscoveryClient
public class FeignServerMain {

    public static void main(String[] args)
    {
        SpringApplication.run(FeignServerMain.class,args);
    }
}
```


### **控制器**


```text
@RestController
public class OrderServerController {

    @GetMapping(value = "/order/get/{id}")
    public Order getPaymentById(@PathVariable("id") Long id)
    {
        return new Order(id, "order");
    }
}

@RestController
public class UserServerController {

    @GetMapping(value = "/user/get/{id}")
    public User getUserById(@PathVariable("id") Long id)
    {
        return new User(id, "user");
    }
}
```


### **服务消费方**


### **项目名称**


cloud-feign-client


### **依赖 (pom.xml)**


```text
<dependencies>
  <!--openfeign-->
  <dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
  </dependency>

  <!--实体类-->
  <dependency>
    <groupId>org.example</groupId>
    <artifactId>cloud-feign-api</artifactId>
    <version>1.0-SNAPSHOT</version>
  </dependency>

  <!-- 注册中心 nacos -->
  <dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
  </dependency>

  <!--web-->
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
  </dependency>

  <!--test-->
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
  </dependency>
</dependencies>
```


### **配置文件(application.yml)**


```text
server:
  port: 9000

spring:
  application:
    name: feign-order-client
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848 #配置Nacos地址
```


### **配置类**


```text
@Configuration
public class DefaultConfiguration {

}

@Configuration
public class OrderConfiguration {

}

@Configuration
public class UserConfiguration {

}
```


### **启动类**


```text
@SpringBootApplication
@EnableFeignClients(defaultConfiguration = {DefaultConfiguration.class}) // 开启feign
@EnableDiscoveryClient
public class FeignClientMain {
    public static void main(String[] args)
    {
        SpringApplication.run(FeignClientMain.class,args);
    }
}
```


### **控制器**


```text
@RestController
public class OrderClientController {

    @Resource
    private OrderService orderService;

    @GetMapping(value = "/consumer/feign/order/get/{id}")
    public Result<Order> getOrderById(@PathVariable("id") Long id)
    {
        Order order = orderService.getOrderById(id);
        return new Result<>(order);
    }
}

@RestController
public class UserClientController {

    @Resource
    private UserService userService;

    @GetMapping(value = "/consumer/feign/user/get/{id}")
    public Result<User> getUserById(@PathVariable("id") Long id)
    {
        User user = userService.getUserById(id);
        return new Result<>(user);
    }
}
```


### **服务接口**


```text
// http://localhost:9000/consumer/feign/order/get/1
@FeignClient(value = "cloud-feign-server", contextId = "order", configuration = OrderConfiguration.class)
public interface OrderService {

    @GetMapping(value = "/order/get/{id}")
    Order getOrderById(@PathVariable("id") Long id);
}

// http://localhost:9000/consumer/feign/user/get/1
@FeignClient(value = "cloud-feign-server", contextId = "user", configuration = UserConfiguration.class)
public interface UserService {

    @GetMapping(value = "/user/get/{id}")
    User getUserById(@PathVariable("id") Long id);
}
```


## **问题：为何只定义接口而没有实现类？**


### **思路分析**


### **问题一：如何动态生成实现类做到？**


动态代理 （cglib, jdk)


### **问题二：代理对象如何交给spring容器？**


把Bean交给spring容器的方法：


1.xml 声明bean  <bean id="", class="">


2.@ConponentScan + @Sevice/@Controller/@Repository/@Componet


3.@Import(XXX.class)


4.ImportSelector 接口 -> 返回类名数组


5.ImportBeanDefinitionRegistrar 接口 -> registerBeanDefinitions


6.@Bean 注解


7.FactoryBean 接口 -> getObject()


8.SingletonBeanRegistry.registerSingleton(); API


前五种方法bean的创建过程是交给spring负责的，流程如下


class -> bean definition -> bean -> put in cache


如何把一个第三方的对象（完全由程序员控制对象创建过程）交给Spring管理？


1.factoryBean


2.SingletonBeanRegistry.registerSingleton();


3.@Bean


openFeign源码采用的是factoryBean


### **问题三：多个接口需要写多个对应的factoryBean类吗？**


不需要


1）只要定义一个factoryBean类，把接口的Class作为变量传给factoryBean


2）针对不同的接口需要创建不同的factoryBean对象，每个factoryBean对象所持有的接口类型是不同的。


```java
class FeignClientFactoryBean implements FactoryBean<Object> {
  private Class<?> type; // 接口类型

    @Override
  public Object getObject() throws Exception {
        // 返回代理对象
    return Proxy.newProxyInstance(this.getClassLoader(),new Class<?>[] {type}, new InvocationHandler());
  }
}
```


关于FactoryBean：


[bookmark](https://www.cnblogs.com/yichunguo/p/13922189.html)


### **问题四：一个factoryBean类如何创建多个持有不同的接口类型的对象?**


不可以用原型模式。


关于原型模式：


[bookmark](https://www.cnblogs.com/clover-toeic/p/11600486.html)


![Untitled.png](/images/7778614651d810a24f389e88860f54f6.png)


1）创建多个Bean Definition


BeanDefinitionBuilder.build()


2）每个Bean Definition 指定不同的接口类型


BeanDefinitionBuilder.addPropertyValue(String name, @Nullable Object value)


BeanDefinitionBuilder.addConstructorArgValue(@Nullable Object value)


### **问题五：如何优雅地把自定义的Bean Definition交给Spring?**


**注意和问题二的区别：一个是代理对象，一个是bean定义**


ImportBeanDefinitionRegistrar 接口


-> registerBeanDefinitions(AnnotationMetadata importingClassMetadata, BeanDefinitionRegistry registry)


@Import、ImportSelector、ImportBeanDefinitionRegistrar的使用和区别


1）@Import(XXX.class)一般配合ImportSelector或者ImportBeanDefinitionRegistrar使用


2）ImportSelector返回的是全类名数组，用于选择需要的配置类


3）ImportBeanDefinitionRegistrar提供BeanDefinitionRegistry，用于注册自定义的Bean Definition


关于@Import、ImportSelector：


[bookmark](https://www.cnblogs.com/daihang2366/p/15080679.html)


[bookmark](https://blog.csdn.net/winterking3/article/details/114537557)


### **问题六：如何获取带有@FeignClient注解的接口以及注解信息？**


包扫描


Spring 提供ClassPathScanningCandidateComponentProvider类做包扫描功能


```java
public class ClassPathScanningCandidateComponentProvider implements EnvironmentCapable, ResourceLoaderAware {
    private final List<TypeFilter> includeFilters = new LinkedList<>();

  private final List<TypeFilter> excludeFilters = new LinkedList<>();

    public Set<BeanDefinition> findCandidateComponents(String basePackage) {
    if (this.componentsIndex != null && indexSupportsIncludeFilters()) {
      return addCandidateComponentsFromIndex(this.componentsIndex, basePackage);
    }
    else {
      return scanCandidateComponents(basePackage);
    }
  }

    private Set<BeanDefinition> scanCandidateComponents(String basePackage) {
    Set<BeanDefinition> candidates = new LinkedHashSet<>();
    try {
      String packageSearchPath = ResourcePatternResolver.CLASSPATH_ALL_URL_PREFIX +
          resolveBasePackage(basePackage) + '/' + this.resourcePattern;
      Resource[] resources = getResourcePatternResolver().getResources(packageSearchPath);

      for (Resource resource : resources) {
        if (resource.isReadable()) {
          try {
            MetadataReader metadataReader = getMetadataReaderFactory().
                            getMetadataReader(resource);
                        // 第一次判断是否是候选组件
            if (isCandidateComponent(metadataReader)) {
              ScannedGenericBeanDefinition sbd = new ScannedGenericBeanDefinition
                                (metadataReader);
              sbd.setResource(resource);
              sbd.setSource(resource);
                            // 第二次判断是否是候选组件
              if (isCandidateComponent(sbd)) {
                candidates.add(sbd);
              }
            }
          }
          catch (Throwable ex) {
            throw new BeanDefinitionStoreException(
                "Failed to read candidate component class: " + resource, ex);
          }
        }
      }
    }
    catch (IOException ex) {
      throw new BeanDefinitionStoreException("I/O failure during classpath scanning", ex);
    }
    return candidates;
  }

    /** 用类型过滤器来判断是否是候选的组件 */
		//类型过滤器中有一个为AnnotationTypeFilter，可以通过注解过滤
    protected boolean isCandidateComponent(MetadataReader metadataReader) throws IOException {
    for (TypeFilter tf : this.excludeFilters) {
      if (tf.match(metadataReader, getMetadataReaderFactory())) {
        return false;
      }
    }
    for (TypeFilter tf : this.includeFilters) {
      if (tf.match(metadataReader, getMetadataReaderFactory())) {
        return isConditionMatch(metadataReader);
      }
    }
    return false;
  }

    /** 判断bean定义是否符合候选的组件:独立的并且是具体的(不是接口或抽象类)  可以重写 */
    protected boolean isCandidateComponent(AnnotatedBeanDefinition beanDefinition) {
    AnnotationMetadata metadata = beanDefinition.getMetadata();
    return (metadata.isIndependent() && (metadata.isConcrete() ||
        (metadata.isAbstract() && metadata.hasAnnotatedMethods(Lookup.class.getName()))));
  }
}
```


### **源码解读**


### **EnableFeignClients**


```java
@Import(FeignClientsRegistrar.class)
public @interface EnableFeignClients {

  // basePackages的别名
  String[] value() default {};

  // 扫描的包
  String[] basePackages() default {};

  // 扫描的包的class
  Class<?>[] basePackageClasses() default {};

    // 默认的配置类
  Class<?>[] defaultConfiguration() default {};

  // 手动传入的feign client对应的Class
  Class<?>[] clients() default {};

}
```


### **FeignClientsRegistrar**


```java
class FeignClientsRegistrar
    implements **ImportBeanDefinitionRegistrar**, ResourceLoaderAware, EnvironmentAware {//继承了**ImportBeanDefinitionRegistrar接口**
    @Override
  public void registerBeanDefinitions(AnnotationMetadata metadata,
      BeanDefinitionRegistry registry) {
        // 注册默认配置
    registerDefaultConfiguration(metadata, registry);
        // 注册feign clients
    **registerFeignClients**(metadata, registry);
  }

    /** 注册默认配置的bean定义(FeignClientSpecification) */
    private void registerDefaultConfiguration(AnnotationMetadata metadata,
      BeanDefinitionRegistry registry) {
        // 从EnableFeignClients注解取出所有的属性 值
	    Map<String, Object> defaultAttrs = metadata
	        .getAnnotationAttributes(EnableFeignClients.class.getName(), true);
	
	        // 如果有配置defaultConfiguration
	    if (defaultAttrs != null && defaultAttrs.containsKey("defaultConfiguration")) {
	      String name;
	      if (metadata.hasEnclosingClass()) {
	        name = "default." + metadata.getEnclosingClassName();
	      }
	      else {
	        name = "default." + metadata.getClassName();
	      }
	      registerClientConfiguration(registry, name,
	          defaultAttrs.get("defaultConfiguration"));
	    }
  }


    /** 注册所有的feign client的bean定义(FeignClientFactoryBean) */
    public void **registerFeignClients**(AnnotationMetadata metadata,
      BeanDefinitionRegistry registry) {
        // 获取扫描器
	    ClassPathScanningCandidateComponentProvider scanner = **getScanner**();
	    scanner.setResourceLoader(this.resourceLoader);
	
	    Set<String> basePackages;
	
			//获取注解里的属性值
	    Map<String, Object> attrs = metadata.getAnnotationAttributes(EnableFeignClients.class.getName());
	        // 创建注解类型的过滤器用于过滤出带有FeignClient注解的类或接口
	    AnnotationTypeFilter annotationTypeFilter = new AnnotationTypeFilter(FeignClient.class);
			//扫描是否有client属性值：FeignClient注解的client属性可以直接列举出feign接口的数组
	    final Class<?>[] clients = attrs == null ? null: (Class<?>[]) attrs.get("clients");
	    if (clients == null || clients.length == 0) {
	      scanner.addIncludeFilter(annotationTypeFilter);
				//如果指定了basepackage或者value，则直接得到；如果没指定，默认扫描添加FeignClient注解的类所在的包
	      basePackages = **getBasePackages**(metadata);
	    }
	    else {
	      final Set<String> clientClasses = new HashSet<>();
	      basePackages = new HashSet<>();
	      for (Class<?> clazz : clients) {
	        basePackages.add(ClassUtils.getPackageName(clazz));
	        clientClasses.add(clazz.getCanonicalName());
	      }
	      AbstractClassTestingTypeFilter filter = new AbstractClassTestingTypeFilter() {
	        @Override
	        protected boolean match(ClassMetadata metadata) {
	          String cleaned = metadata.getClassName().replaceAll("\\$", ".");
	          return clientClasses.contains(cleaned);
	        }
	      };
	      scanner.addIncludeFilter(
	          new AllTypeFilter(Arrays.asList(filter, annotationTypeFilter)));
	    }
	
	        /** 进行包扫描 */
	    for (String basePackage : basePackages) {
	            // 根据每一个包找出候选的bean定义
	      Set<BeanDefinition> candidateComponents = scanner
	          .findCandidateComponents(basePackage);
	      for (BeanDefinition candidateComponent : candidateComponents) {
	        if (candidateComponent instanceof AnnotatedBeanDefinition) {
	          AnnotatedBeanDefinition beanDefinition = (AnnotatedBeanDefinition) candidateComponent;
	                    // 获取注解的数据
	          AnnotationMetadata annotationMetadata = beanDefinition.getMetadata();
	          // 获取FeignClient注解的属性值
	          Map<String, Object> attributes = annotationMetadata
	              .getAnnotationAttributes(
	                  FeignClient.class.getCanonicalName());
	          // 获取FeignClient的名字
	          String name = **getClientName**(attributes);
	                    // 注册每个feign client注册对应的配置(FeignClientSpecification)
	          registerClientConfiguration(registry, name,
	              attributes.get("configuration"));
	          // 注册feign client的bean定义(FeignClientFactoryBean)
	          registerFeignClient(registry, annotationMetadata, attributes);
	        }
	      }
	    }
	  }

    /** 获取扫描器 重写第二个isCandidateComponent */
    protected ClassPathScanningCandidateComponentProvider **getScanner**() {
	    return new ClassPathScanningCandidateComponentProvider(false, this.environment) {
	      @Override
	      protected boolean isCandidateComponent(
	          AnnotatedBeanDefinition beanDefinition) {
	        boolean isCandidate = false;
	                // bean定义对应的class不能是注解
	        if (beanDefinition.getMetadata().isIndependent()) {
	          if (!beanDefinition.getMetadata().isAnnotation()) {
	            isCandidate = true;
	          }
	        }
	        return isCandidate;
	      }
	    };
	  }

    /** 根据配置类生成并注册FeignClientSpecification的bean定义*/
    private void registerClientConfiguration(BeanDefinitionRegistry registry, Object name,
      Object configuration) {

	    BeanDefinitionBuilder builder = BeanDefinitionBuilder
	        .genericBeanDefinition(FeignClientSpecification.class);
	    builder.addConstructorArgValue(name);
	    builder.addConstructorArgValue(configuration);
	    registry.registerBeanDefinition(
	        name + "." + FeignClientSpecification.class.getSimpleName(),
	        builder.getBeanDefinition());
	  }

    /** 生成并注册FeignClientFactoryBean的bean定义 */
    private void registerFeignClient(BeanDefinitionRegistry registry,
      AnnotationMetadata annotationMetadata, Map<String, Object> attributes) {
	    String className = annotationMetadata.getClassName();
	    **BeanDefinitionBuilder definition = BeanDefinitionBuilder
	        .genericBeanDefinition(FeignClientFactoryBean.class);**
	    validate(attributes);
	    definition.addPropertyValue("url", getUrl(attributes));
	    definition.addPropertyValue("path", getPath(attributes));
	    String name = getName(attributes);
	    definition.addPropertyValue("name", name);
	    String contextId = getContextId(attributes);
	    definition.addPropertyValue("contextId", contextId);
	    definition.addPropertyValue("type", className);
	    definition.addPropertyValue("decode404", attributes.get("decode404"));
	    definition.addPropertyValue("fallback", attributes.get("fallback"));
	    definition.addPropertyValue("fallbackFactory", attributes.get("fallbackFactory"));
	    definition.setAutowireMode(AbstractBeanDefinition.AUTOWIRE_BY_TYPE);
	
	    String alias = contextId + "FeignClient";
	    **AbstractBeanDefinition beanDefinition = definition.getBeanDefinition();**
	
	    boolean primary = (Boolean) attributes.get("primary"); // has a default, won't be
	                                // null
	
	    beanDefinition.setPrimary(primary);
	
	    String qualifier = getQualifier(attributes);
	    if (StringUtils.hasText(qualifier)) {
	      alias = qualifier;
	    }
		
	    BeanDefinitionHolder holder = new BeanDefinitionHolder(beanDefinition, className,
	        new String[] { alias });
	    **BeanDefinitionReaderUtils.registerBeanDefinition(holder, registry);**
	  }
}
```


### **FeignClientFactoryBean**


```text
class FeignClientFactoryBean
		implements FactoryBean<Object>, InitializingBean, ApplicationContextAware {

    private Class<?> type;

    @Override
	public Object getObject() throws Exception {
		return getTarget();
	}

	/**
	 * @param <T> the target type of the Feign client
	 * @return a {@link Feign} client created with the specified data and the context
	 * information
	 */
	<T> T getTarget() {
		FeignContext context = this.applicationContext.getBean(FeignContext.class);
		Feign.Builder builder = feign(context);

		if (!StringUtils.hasText(this.url)) {
			if (!this.name.startsWith("http")) {
				this.url = "http://" + this.name;
			}
			else {
				this.url = this.name;
			}
			this.url += cleanPath();
			return (T) loadBalance(builder, context,
					new HardCodedTarget<>(this.type, this.name, this.url));
		}
		if (StringUtils.hasText(this.url) && !this.url.startsWith("http")) {
			this.url = "http://" + this.url;
		}
		String url = this.url + cleanPath();
		Client client = getOptional(context, Client.class);
		if (client != null) {
			if (client instanceof LoadBalancerFeignClient) {
				// not load balancing because we have a url,
				// but ribbon is on the classpath, so unwrap
				client = ((LoadBalancerFeignClient) client).getDelegate();
			}
			if (client instanceof FeignBlockingLoadBalancerClient) {
				// not load balancing because we have a url,
				// but Spring Cloud LoadBalancer is on the classpath, so unwrap
				client = ((FeignBlockingLoadBalancerClient) client).getDelegate();
			}
			builder.client(client);
		}
		Targeter targeter = get(context, Targeter.class);
		return (T) targeter.target(this, builder, context,
				new HardCodedTarget<>(this.type, this.name, url));
	}
}
```


### **DefaultTargeter**


```text
class DefaultTargeter implements Targeter {

	@Override
	public <T> T target(FeignClientFactoryBean factory, Feign.Builder feign,
			FeignContext context, Target.HardCodedTarget<T> target) {
		return feign.target(target);
	}

}
```


### **Feign**


```text
public abstract class Feign {

  public static Builder builder() {
    return new Builder();
  }

  public <T> T target(Target<T> target) {
    return build().newInstance(target);
  }

  public Feign build() {
      SynchronousMethodHandler.Factory synchronousMethodHandlerFactory =
          new SynchronousMethodHandler.Factory(client, retryer, requestInterceptors, logger,
                                               logLevel, decode404, closeAfterDecode, propagationPolicy);
      ParseHandlersByName handlersByName =
          new ParseHandlersByName(contract, options, encoder, decoder, queryMapEncoder,
                                  errorDecoder, synchronousMethodHandlerFactory);
      return new ReflectiveFeign(handlersByName, invocationHandlerFactory, queryMapEncoder);
  }
}
```


### **ReflectiveFeign**


```text
public class ReflectiveFeign extends Feign {

  private final InvocationHandlerFactory factory;
  @Override
  public <T> T newInstance(Target<T> target) {
    Map<String, MethodHandler> nameToHandler = targetToHandlersByName.apply(target);
    Map<Method, MethodHandler> methodToHandler = new LinkedHashMap<Method, MethodHandler>();
    List<DefaultMethodHandler> defaultMethodHandlers = new LinkedList<DefaultMethodHandler>();

    for (Method method : target.type().getMethods()) {
      if (method.getDeclaringClass() == Object.class) {
        continue;
      } else if (Util.isDefault(method)) {
        DefaultMethodHandler handler = new DefaultMethodHandler(method);
        defaultMethodHandlers.add(handler);
        methodToHandler.put(method, handler);
      } else {
        methodToHandler.put(method, nameToHandler.get(Feign.configKey(target.type(), method)));
      }
    }
    InvocationHandler handler = factory.create(target, methodToHandler);
    T proxy = (T) Proxy.newProxyInstance(target.type().getClassLoader(),
        new Class<?>[] {target.type()}, handler);

    for (DefaultMethodHandler defaultMethodHandler : defaultMethodHandlers) {
      defaultMethodHandler.bindTo(proxy);
    }
    return proxy;
  }
}
```


### **总结**


设计：只需要定义接口 + 注解， 没有具体的实现类


解决方案：根据接口动态生成代理对象，把增强功能封装在里面，并把此对象交给spring管理


技术点：动态代理，factoryBean接口，包扫描，如何把自定义的Bean 定义交给spring（ImportBeanDefinitionRegistrar）, 如何把自定义的对象交给spring备份


本节OpenFeign的原理和mybatis原理几乎相同


## Second

# **如何发送http请求？**


## **如何组件化？**


### **定义接口**


```text
public interface Client {
  Response execute(Request request, Options options) throws IOException;
}
```


### **接口实现**


**发送http请求，是否存在已有的方案？**

1. rest template
2. http client
3. ok http

……


现有方案的很多组件（如response类等）和OpenFeign中定义接口中的组件不同


可以通过适配器模式整合现有方案


### **如何整合已有的方案？**


![Untitled.png](/images/b538c57c9e5db9ec94addf4ba840833b.png)


```java
/** http client的适配器 */
public final class ApacheHttpClient implements Client {

  private final HttpClient client;

  public ApacheHttpClient(HttpClient client) {
    this.client = client;
  }

  @Override
  public Response execute(Request request, Request.Options options) throws IOException {
    HttpUriRequest httpUriRequest;
    try {
      httpUriRequest = toHttpUriRequest(request, options);
    } catch (URISyntaxException e) {
      throw new IOException("URL '" + request.url() + "' couldn't be parsed into a URI", e);
    }
    HttpResponse httpResponse = client.execute(httpUriRequest);
    return toFeignResponse(httpResponse, request);
  }
}

/** ok http 的适配器 */
public final class OkHttpClient implements Client {

  private final okhttp3.OkHttpClient delegate;

  public OkHttpClient(okhttp3.OkHttpClient delegate) {
    this.delegate = delegate;
  }

 @Override
  public feign.Response execute(feign.Request input, feign.Request.Options options)
      throws IOException {
    okhttp3.OkHttpClient requestScoped;
    if (delegate.connectTimeoutMillis() != options.connectTimeoutMillis()
        || delegate.readTimeoutMillis() != options.readTimeoutMillis()) {
      requestScoped = delegate.newBuilder()
          .connectTimeout(options.connectTimeoutMillis(), TimeUnit.MILLISECONDS)
          .readTimeout(options.readTimeoutMillis(), TimeUnit.MILLISECONDS)
          .followRedirects(options.isFollowRedirects())
          .build();
    } else {
      requestScoped = delegate;
    }
    Request request = toOkHttpRequest(input);
    Response response = requestScoped.newCall(request).execute();
    return toFeignResponse(response, input).toBuilder().request(input).build();
  }
}
```


适配器需要引入的包(Pom.xml)


```text
<dependency>
  <groupId>io.github.openfeign</groupId>
  <artifactId>feign-httpclient</artifactId>
</dependency>

<dependency>
  <groupId>io.github.openfeign</groupId>
  <artifactId>feign-okhttp</artifactId>
</dependency>
```


### **如何动态选择实现方案？**


插拔式：


提供几种思路：


1）JAVA SPI -> 无法提供依赖注入，无法动态地选择实现类


JAVA SPI调用类的无参构造方法进行实例化，而我们需要的是进行依赖注入


如果两种依赖都引入了，JAVA SPI会对两种都进行实例化，，而我们常常只需要一种，因此这并不是我们想要的


2）Dubbo SPI -> 额外添加dubbo依赖，Dubbo SPI 与其业务模型耦合


3）springboot的自动装配 ->  open feign 作为spirngcloud组件之一直接依托于springboot


### **技巧：如何快速找到自动装配类？**


1）Ctrl+G  -> find Usages 功能  寻找new Instance


2）通过名字去猜  autoconfiguration结尾， 其中带有feign开头


3）直接通过 spring.factories 文件去搜索


spring-cloud-openfeign-core-2.2.1.RELEASE.jar -> META-INF/spring.factories


```text
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
org.springframework.cloud.openfeign.ribbon.FeignRibbonClientAutoConfiguration,\
org.springframework.cloud.openfeign.hateoas.FeignHalAutoConfiguration,\
org.springframework.cloud.openfeign.FeignAutoConfiguration,\
org.springframework.cloud.openfeign.encoding.FeignAcceptGzipEncodingAutoConfiguration,\
org.springframework.cloud.openfeign.encoding.FeignContentGzipEncodingAutoConfiguration,\
org.springframework.cloud.openfeign.loadbalancer.FeignLoadBalancerAutoConfiguration
```


### **feign 的带负载均衡的自动配置类**


```java
@Import({ **HttpClientFeignLoadBalancedConfiguration.class**,
    OkHttpFeignLoadBalancedConfiguration.class,
    DefaultFeignLoadBalancedConfiguration.class })
public class FeignRibbonClientAutoConfiguration {
  // ...
}
```


### **HttpClient适配器的配置类**


```java
@Configuration(proxyBeanMethods = false)
@ConditionalOnClass(ApacheHttpClient.class)
@ConditionalOnProperty(value = "feign.httpclient.enabled", matchIfMissing = true)
@Import(**HttpClientFeignConfiguration**.class)
class HttpClientFeignLoadBalancedConfiguration {

  @Bean
  @ConditionalOnMissingBean(Client.class)
  public Client feignClient(CachingSpringLoadBalancerFactory cachingFactory,
      SpringClientFactory clientFactory, **HttpClient** httpClient) {
    ApacheHttpClient delegate = new ApacheHttpClient(httpClient);
    return new LoadBalancerFeignClient(delegate, cachingFactory, clientFactory);
  }
}
```


### **HttpClient的配置类**


```java
@Configuration(proxyBeanMethods = false)
@ConditionalOnMissingBean(CloseableHttpClient.class)
public class HttpClientFeignConfiguration {

  private final Timer connectionManagerTimer = new Timer(
      "FeignApacheHttpClientConfiguration.connectionManagerTimer", true);

  private CloseableHttpClient httpClient;

  @Autowired(required = false)
  private RegistryBuilder registryBuilder;

  @Bean
  @ConditionalOnMissingBean(HttpClientConnectionManager.class)
  public HttpClientConnectionManager connectionManager(
      ApacheHttpClientConnectionManagerFactory connectionManagerFactory,
      FeignHttpClientProperties httpClientProperties) {
    final HttpClientConnectionManager connectionManager = connectionManagerFactory
        .newConnectionManager(httpClientProperties.isDisableSslValidation(),
            httpClientProperties.getMaxConnections(),
            httpClientProperties.getMaxConnectionsPerRoute(),
            httpClientProperties.getTimeToLive(),
            httpClientProperties.getTimeToLiveUnit(), this.registryBuilder);
    this.connectionManagerTimer.schedule(new TimerTask() {
      @Override
      public void run() {
        connectionManager.closeExpiredConnections();
      }
    }, 30000, httpClientProperties.getConnectionTimerRepeat());
    return connectionManager;
  }

    // ...

  @Bean
  @ConditionalOnProperty(value = "feign.compression.response.enabled",
      havingValue = "false", matchIfMissing = true)
  public CloseableHttpClient httpClient(ApacheHttpClientFactory httpClientFactory,
      HttpClientConnectionManager httpClientConnectionManager,
      FeignHttpClientProperties httpClientProperties) {
    this.httpClient = createClient(httpClientFactory.createBuilder(),
        httpClientConnectionManager, httpClientProperties);
    return this.httpClient;
  }

  private CloseableHttpClient createClient(HttpClientBuilder builder,
      HttpClientConnectionManager httpClientConnectionManager,
      FeignHttpClientProperties httpClientProperties) {
    RequestConfig defaultRequestConfig = RequestConfig.custom()
        .setConnectTimeout(httpClientProperties.getConnectionTimeout())
        .setRedirectsEnabled(httpClientProperties.isFollowRedirects()).build();
    CloseableHttpClient httpClient = builder
        .setDefaultRequestConfig(defaultRequestConfig)
        .setConnectionManager(httpClientConnectionManager).build();
    return httpClient;
  }
}
```


### **如果同时依赖了http client和ok http？**


@import导入的时候按照顺序，先HttpClientFeignLoadBalancedConfiguration.class再OkHttpFeignLoadBalancedConfiguration.class。


而两个配置类都含有@ConditionalOnMissingBean(Client.class)


如果先导入HttpClientFeignLoadBalancedConfiguration后，就含有了Client的bean，再导入OkHttpFeignLoadBalancedConfiguration的时候就会条件不成立，不会导入。


```java
// 依照import的顺序 http client -> ok http -> jdk
@Import({ HttpClientFeignLoadBalancedConfiguration.class,
    OkHttpFeignLoadBalancedConfiguration.class,
    DefaultFeignLoadBalancedConfiguration.class })
public class FeignRibbonClientAutoConfiguration {
  // ...
}
```


### **如何修改配置参数？**


方法一：通过配置文件修改FeignHttpClientProperties的参数（属性绑定）


```java
@Configuration(proxyBeanMethods = false)
@ConditionalOnMissingBean(CloseableHttpClient.class)
public class HttpClientFeignConfiguration { // http client的配置类
    @Bean
	@ConditionalOnMissingBean(HttpClientConnectionManager.class)
	public HttpClientConnectionManager connectionManager(
			ApacheHttpClientConnectionManagerFactory connectionManagerFactory,
			**FeignHttpClientProperties** httpClientProperties) {
				final HttpClientConnectionManager connectionManager = connectionManagerFactory
						.newConnectionManager(httpClientProperties.isDisableSslValidation(),
								httpClientProperties.getMaxConnections(),
								httpClientProperties.getMaxConnectionsPerRoute(),
								httpClientProperties.getTimeToLive(),
								httpClientProperties.getTimeToLiveUnit(), this.registryBuilder);
				this.connectionManagerTimer.schedule(new TimerTask() {
					@Override
					public void run() {
						connectionManager.closeExpiredConnections();
					}
				}, 30000, httpClientProperties.getConnectionTimerRepeat());
				return connectionManager;
			}
	}
```


方法二：修改配置类(@Bean) 替换源码中的配置


自定义的配置类优先生效于框架的配置类


```java
@Configuration
public class DefaultConfiguration {

		//修改**HttpClientBuilder配置类**
    @Bean
    public **HttpClientBuilder** apacheHttpClientBuilder() {
        // 修改builder参数
        return HttpClientBuilder.create().setMaxConnTotal(1000);
    }
}
```


## **如何装配组件？**


### **组件装配到哪里？**


答案： SynchronousMethodHandler


```java
public class ReflectiveFeign extends Feign {
    // ...

    /** 创建JDK动态代理对象 */
    @Override
    public <T> T newInstance(Target<T> target) {
        Map<String, MethodHandler> nameToHandler = targetToHandlersByName.apply(target);
        Map<Method, MethodHandler> methodToHandler = new LinkedHashMap<Method, MethodHandler>();
        List<DefaultMethodHandler> defaultMethodHandlers = new LinkedList<DefaultMethodHandler>();

        for (Method method : target.type().getMethods()) {
          if (method.getDeclaringClass() == Object.class) {
            continue;
          } else if (Util.isDefault(method)) {
            DefaultMethodHandler handler = new DefaultMethodHandler(method);
            defaultMethodHandlers.add(handler);
            methodToHandler.put(method, handler);
          } else {
            methodToHandler.put(method, nameToHandler.get(Feign.configKey(target.type(), method)));
          }
        }
        // 通过工厂创建FeignInvocationHandler对象并把methodToHandler封装进去
        InvocationHandler handler = factory.create(target, methodToHandler);
        // JDK动态代理的API
        T proxy = (T) Proxy.newProxyInstance(target.type().getClassLoader(),
            new Class<?>[] {target.type()}, handler);

        for (DefaultMethodHandler defaultMethodHandler : defaultMethodHandlers) {
          defaultMethodHandler.bindTo(proxy);
        }
        return proxy;
    }

    // jdk动态代理的第三个参数InvocationHandler
    static class **FeignInvocationHandler** implements InvocationHandler {
        private final Target target;
				//一个方法对应一个MethodHandler
        private final Map<Method, MethodHandler> dispatch; // 每个方法封装到MethodHandler

        FeignInvocationHandler(Target target, Map<Method, MethodHandler> dispatch) {
          this.target = checkNotNull(target, "target");
          this.dispatch = checkNotNull(dispatch, "dispatch for %s", target);
        }

        @Override
        public Object **invoke**(Object proxy, Method method, Object[] args) throws Throwable {
          if ("equals".equals(method.getName())) {
            try {
              Object otherHandler =
                  args.length > 0 && args[0] != null ? Proxy.getInvocationHandler(args[0]) : null;
              return equals(otherHandler);
            } catch (IllegalArgumentException e) {
              return false;
            }
          } else if ("hashCode".equals(method.getName())) {
            return hashCode();
          } else if ("toString".equals(method.getName())) {
            return toString();
          }
					//调用的是Method对应的的MethodHandler里的invoke方法
          return **dispatch.get(method).invoke(args)**;
        }
    }
}
```


```java
final class SynchronousMethodHandler implements MethodHandler {

  private final MethodMetadata metadata;
  private final Target<?> target;
  private final Client client; // http 请求客户端
  private final Retryer retryer;
  private final List<RequestInterceptor> requestInterceptors;
  private final Logger logger;
  private final Logger.Level logLevel;
  private final RequestTemplate.Factory buildTemplateFromArgs;
  private final Options options;
  // ...

  private **SynchronousMethodHandler**(Target<?> target, Client client, Retryer retryer,
      List<RequestInterceptor> requestInterceptors, Logger logger,
      Logger.Level logLevel, MethodMetadata metadata,
      RequestTemplate.Factory buildTemplateFromArgs, Options options,
      Decoder decoder, ErrorDecoder errorDecoder, boolean decode404,
      boolean closeAfterDecode, ExceptionPropagationPolicy propagationPolicy) {
    // ...
    this.client = checkNotNull(client, "client for %s", target);
    // ...
  }

  /** 真正地调用每个方法 */
  @Override
  public Object invoke(Object[] argv) throws Throwable {
    RequestTemplate template = buildTemplateFromArgs.create(argv);
    Options options = findOptions(argv);
    Retryer retryer = this.retryer.clone();
    while (true) {
      try {
        return **executeAndDecode**(template, options); // 调用client
      } catch (RetryableException e) {
        try {
          retryer.continueOrPropagate(e);
        } catch (RetryableException th) {
          Throwable cause = th.getCause();
          if (propagationPolicy == UNWRAP && cause != null) {
            throw cause;
          } else {
            throw th;
          }
        }
        if (logLevel != Logger.Level.NONE) {
          logger.logRetry(metadata.configKey(), logLevel);
        }
        continue;
      }
    }
  }


  Object **executeAndDecode**(RequestTemplate template, Options options) throws Throwable {
    Request request = targetRequest(template);

    if (logLevel != Logger.Level.NONE) {
      logger.logRequest(metadata.configKey(), logLevel, request);
    }

    Response response;
    long start = System.nanoTime();
    try {
      response = client.execute(request, options); // 调用client组件的execute方法
    } catch (IOException e) {
      if (logLevel != Logger.Level.NONE) {
        logger.logIOException(metadata.configKey(), logLevel, e, elapsedTime(start));
      }
      throw errorExecuting(request, e);
    }
    // ...
  }
}
```


### **如何获取组件？**

1. Autowired 自动装配
2. 通过aware接口获取BeanFactory或ApplicationContext，再从里面获取

OpenFeign采用第二种方式：


`FeignClientFactoryBean`类的getObject方法 


→ loadBalance方法 


```java
protected <T> T loadBalance(Feign.Builder builder, FeignClientFactory context, HardCodedTarget<T> target) {
		Client client = getOptional(context, Client.class);
		if (client != null) {
			builder.client(client);
			applyBuildCustomizers(context, builder);
			Targeter targeter = get(context, Targeter.class);
			return targeter.target(this, builder, context, target);
		}

		throw new IllegalStateException(
				"No Feign Client for loadBalancing defined. Did you forget to include spring-cloud-starter-loadbalancer?");
	}
```


FeignClientFactory context是什么？


→ getOptional方法


```java
protected <T> T getOptional(FeignClientFactory context, Class<T> type) {
			//传入contextId和type
			return context.getInstance(contextId, type);
	}
```


→ getInstance方法


```java
public <T> T getInstance(String name, Class<T> type) {
        GenericApplicationContext context = this.getContext(name);

        try {
            return **context.getBean(type);**
        } catch (NoSuchBeanDefinitionException var5) {
            return null;
        }
    }
```


→ getContext方法（`NamedContextFactory`中）


```java
protected GenericApplicationContext getContext(String name) {
        if (!this.contexts.containsKey(name)) {
            synchronized(this.contexts) {
                if (!this.contexts.containsKey(name)) {
                    this.contexts.put(name, this.createContext(name));
                }
            }
        }

        return (GenericApplicationContext)this.contexts.get(name);
    }
```


其中_`private final Map`_`<String, GenericApplicationContext> contexts;`


对于每一个contextId，都会创建一个子容器。一个feign接口创建一个对应的子容器。配置好后存入map`contexts`


FeignContext继承了`NamedContextFactory` 


上述过程如图：


![Untitled.png](/images/a0f2978611c4e650e72e1e33bd814342.png)


getInstance方法得到的容器是子容器。**context.getBean(type);**的时候会先从子容器拿，拿不到再去父容器拿。（注意是getBean类型方式获得）


很多其他的组件也是这个思路。

<details>
<summary>为什么对每个feign接口都要创建一个子容器？</summary>

这样我们可以对每个feign接口进行单独的配置，每个接口的配置都可以不相同，接口对应的容器来解析每个接口的配置。例如，一个接口可以采用httpclient，而另一个接口可以采用okhttp。


最终这些所有的容器统一被放在FiegnContext中。


</details>


所以如何获取组件？就是从该接口对应的子容器中getBean类型得到组件。


### **如何传递组件？**


```java
protected <T> T loadBalance(Feign.Builder builder, FeignClientFactory context, HardCodedTarget<T> target) {
		Client client = getOptional(context, Client.class);
		if (client != null) {
			builder.client(client);
			applyBuildCustomizers(context, builder);
			Targeter targeter = get(context, Targeter.class);
			return targeter.target(this, builder, context, target);
		}

		throw new IllegalStateException(
				"No Feign Client for loadBalancing defined. Did you forget to include spring-cloud-starter-loadbalancer?");
	}
```


loadBalance中，把client组件传给了Feign.Builder builder


再通过 Feign.Builder 的build方法传给 SynchronousMethodHandler.Factory 


最后通过SynchronousMethodHandler的create方法传给SynchronousMethodHandler


## **总结**


设计：组件化思维


技术点：适配器模式，springboot自动装配（@Conditional注解的解读，@Import注解的顺序），父子容器


## Third

# **配置体系**


## **配置类**


	### **应用级别配置（全局）**


	```java
	@Retention(RetentionPolicy.RUNTIME)
	@Target(ElementType.TYPE)
	@Documented
	@Import(FeignClientsRegistrar.class) // 注册feign client的bean定义
	public @interface EnableFeignClients {
	
	  String[] value() default {};
	  String[] basePackages() default {};
	  Class<?>[] basePackageClasses() default {};
	  Class<?>[] defaultConfiguration() default {}; // 默认配置全局有效
	  Class<?>[] clients() default {};
	}
	```


	```java
	@SpringBootApplication
	@EnableFeignClients(defaultConfiguration = {DefaultConfiguration.class}) // 配置在启动类上
	@EnableDiscoveryClient
	public class FeignClientMain {
	  // ...
	}
	```


	### **服务级别配置**


	```text
	@Target(ElementType.TYPE)
	@Retention(RetentionPolicy.RUNTIME)
	@Documented
	public @interface FeignClient {
	    // ...
	    Class<?>[] configuration() default {}; // 只对服务接口有效
	    // ...
	}
	```


	```text
	// 配置在服务接口
	@FeignClient(value = "cloud-feign-server", contextId = "order", configuration = OrderConfiguration.class)
	public interface OrderService {
	  // ...
	}
	
	@FeignClient(value = "cloud-feign-server", contextId = "user", configuration = UserConfiguration.class)
	public interface UserService {
	    // ...
	}
	```


	### **配置隔离原理**


	一句话：通过spring子容器进行隔离，不同的feign client接口对应不同的子容器，里面有自己独立的配置


	### **1) 注册配置类到spring父容器**


		```java
		class **FeignClientsRegistrar //这个类通过@FeignCLients -> @Import注入**
		    implements ImportBeanDefinitionRegistrar, ResourceLoaderAware, EnvironmentAware {
		
		    /** ImportBeanDefinitionRegistrar的方法 */
		  @Override
		  public void registerBeanDefinitions(AnnotationMetadata metadata,
		      BeanDefinitionRegistry registry) {
		    registerDefaultConfiguration(metadata, registry);
		    registerFeignClients(metadata, registry);
		  }
		
		    /** 注册默认的配置类 */
		    private void registerDefaultConfiguration(AnnotationMetadata metadata,
		      BeanDefinitionRegistry registry) {
		        // 获取ableFeignClients注解的信息
		    Map<String, Object> defaultAttrs = metadata
		        .getAnnotationAttributes(EnableFeignClients.class.getName(), true);
		
		        // 获取defaultConfiguration的值
		    if (defaultAttrs != null && defaultAttrs.containsKey("defaultConfiguration")) {
		      String name;
		      if (metadata.hasEnclosingClass()) {
		        name = "default." + metadata.getEnclosingClassName();
		      }
		      else {
		        name = "default." + metadata.getClassName();
		      }
		      registerClientConfiguration(registry, name,
		          defaultAttrs.get("defaultConfiguration"));
		    }
		  }
		
		    public void registerFeignClients(AnnotationMetadata metadata,
		      BeanDefinitionRegistry registry) {
		        // ...
		
		    for (String basePackage : basePackages) {
		      Set<BeanDefinition> candidateComponents = scanner
		          .findCandidateComponents(basePackage);
		      for (BeanDefinition candidateComponent : candidateComponents) {
		        if (candidateComponent instanceof AnnotatedBeanDefinition) {
		          // verify annotated class is an interface
		          AnnotatedBeanDefinition beanDefinition = (AnnotatedBeanDefinition) candidateComponent;
		          AnnotationMetadata annotationMetadata = beanDefinition.getMetadata();
		          Assert.isTrue(annotationMetadata.isInterface(),
		              "@FeignClient can only be specified on an interface");
		
		          Map<String, Object> attributes = annotationMetadata
		              .getAnnotationAttributes(
		                  FeignClient.class.getCanonicalName());
		
		          String name = getClientName(attributes);
		                    // 注册服务接口的配置类
		          registerClientConfiguration(registry, name, attributes.get("configuration"));
		
		          registerFeignClient(registry, annotationMetadata, attributes);
		        }
		      }
		    }
		    }
		
		    // 注意这里不是注册配置类本身 注册的是FeignClientSpecification 但里面封装了配置类
		    private void registerClientConfiguration(BeanDefinitionRegistry registry, Object name,
		      Object configuration) {
		        // 注册FeignClientSpecification的bean定义
		    BeanDefinitionBuilder builder = BeanDefinitionBuilder
		        .genericBeanDefinition(**FeignClientSpecification**.class);
		    builder.addConstructorArgValue(name);
		        // 把配置类通过构造方法传入
		    builder.addConstructorArgValue(configuration);
		    registry.registerBeanDefinition(
		        name + "." + FeignClientSpecification.class.getSimpleName(),
		        builder.getBeanDefinition());
		  }
		}
		```


		注意不是直接注册配置类本身，而是 FeignClientSpecification 类


		```java
		public class FeignClientSpecification implements NamedContextFactory.Specification {
		
			private String name;
		
			private String className;
			//配置类
			private Class<?>[] configuration;
		
			......
		```

<details>
<summary>注册配置类本身和注册规格（FeignClientSpecification）类的区别：</summary>

如果直接注册配置类本身，就会走spring中refresh的流程，会把配置类中的bean都创建出来并放入父容器中


而注册规格类，在整个ioc期间就不会去解析配置类


</details>


	### **2) 注入配置类到FeignContext**


		```java
		@Configuration(proxyBeanMethods = false)
		@ConditionalOnClass(Feign.class)
		@EnableConfigurationProperties({ FeignClientProperties.class,
		    FeignHttpClientProperties.class })
		@Import(DefaultGzipDecoderConfiguration.class)
		public class FeignAutoConfiguration {
		
		    // 把所有FeignClientSpecification对象注入到集合里面
		  @Autowired(required = false)
		  **private List<FeignClientSpecification> configurations = new ArrayList<>();**
		
		  @Bean
		  public FeignContext feignContext() {
		    FeignContext context = new FeignContext();
		    context.setConfigurations(this.configurations);
		    return context;
		  }
		}
		```


	### **3) 从FeignContext中获取组件**


		```java
		class FeignClientFactoryBean
		    implements FactoryBean<Object>, InitializingBean, ApplicationContextAware {
		  // ...
		
		    // 使用配置类进行配置
		  protected void configureUsingConfiguration(FeignContext context,
		      Feign.Builder builder) {
		        // 从spring容器获取组件
		        Logger.Level level = getOptional(context, Logger.Level.class);
		
		        // ...
		
		        // 从spring容器获取组件
		        Map<String, RequestInterceptor> requestInterceptors = context
		        .**getInstances**(this.contextId, RequestInterceptor.class);
		
		        // ...
		  }
		
		    protected <T> T getOptional(FeignContext context, Class<T> type) {
		    return context.getInstance(this.contextId, type);
		  }
		}
		```


	### **4) 创建子容器加载配置**


		```java
		// FeignContext
		public class FeignContext extends NamedContextFactory<FeignClientSpecification> {
		
		  public FeignContext() {
		        // 传入FeignClients的官方默认配置类
		    super(FeignClient**s**Configuration.class, "feign", "feign.client.name");
		  }
		}
		
		// 带名字的上下文工厂
		public abstract class NamedContextFactory<C extends NamedContextFactory.Specification>
		    implements DisposableBean, ApplicationContextAware {
		
		    public NamedContextFactory(Class<?> defaultConfigType, String propertySourceName,
		      String propertyName) {
		    this.defaultConfigType = defaultConfigType; // 传入官方默认配置类
		    this.propertySourceName = propertySourceName;
		    this.propertyName = propertyName;
		  }
		
		    // 存储子容器的Map
		    private Map<String, AnnotationConfigApplicationContext> contexts = new ConcurrentHashMap<>();
		
		    // value是FeignClientSpecification对象
		  private Map<String, C> configurations = new ConcurrentHashMap<>();
		
		    // 父容器 通过ApplicationContextAware注入
		  private ApplicationContext parent;
		
		    // 默认配置类是FeignClientsConfiguration
		    private Class<?> defaultConfigType;
		
		    /** 把配置的List转为Map */
		    public void setConfigurations(List<C> configurations) {
		    for (C client : configurations) {
		      this.configurations.put(client.getName(), client);
		    }
		  }
		
		    // 从spring父子容器中获取单个对象
		    public <T> T getInstance(String name, Class<T> type) {
		    AnnotationConfigApplicationContext context = getContext(name);
		    if (BeanFactoryUtils.beanNamesForTypeIncludingAncestors(context,
		        type).length > 0) {
		      return context.getBean(type);
		    }
		    return null;
		  }
		
		    // 从spring父子容器中获取多个对象
		    public <T> Map<String, T> getInstances(String name, Class<T> type) {
		    AnnotationConfigApplicationContext context = getContext(name);
		    if (BeanFactoryUtils.beanNamesForTypeIncludingAncestors(context,
		        type).length > 0) {
		      return BeanFactoryUtils.beansOfTypeIncludingAncestors(context, type);
		    }
		    return null;
		  }
		
		    /** 获取context */
		    protected AnnotationConfigApplicationContext getContext(String name) {
		    if (!this.contexts.containsKey(name)) {
		      synchronized (this.contexts) {
		        if (!this.contexts.containsKey(name)) {
		          this.contexts.put(name, createContext(name));
		        }
		      }
		    }
		    return this.contexts.get(name);
		  }
		
		    /** 创建context */
		    protected AnnotationConfigApplicationContext createContext(String name) {
		       // 每个接口创建自己的子容器
		       AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
		       // 注册属于服务接口的配置类
		        if (this.configurations.containsKey(name)) {
		          for (Class<?> configuration : this.configurations.get(name)
		                .getConfiguration()) {
		             context.register(configuration);
		          }
		       }
		        // 注册应用全局的配置类
		       for (Map.Entry<String, C> entry : this.configurations.entrySet()) {
		          if (entry.getKey().startsWith("default.")) {
		             for (Class<?> configuration : entry.getValue().getConfiguration()) {
		                context.register(configuration);
		             }
		          }
		       }
		       // 注册默认的配置类
		       context.register(PropertyPlaceholderAutoConfiguration.class,
		             this.defaultConfigType);
		
		       context.getEnvironment().getPropertySources().addFirst(new MapPropertySource(
		             this.propertySourceName,
		             Collections.<String, Object>singletonMap(this.propertyName, name)));
		
		       // 父容器就是当前应用的spring容器
		       if (this.parent != null) {
		          context.setParent(this.parent);
		          context.setClassLoader(this.parent.getClassLoader());
		       }
		       context.setDisplayName(generateDisplayName(name));
		       context.**refresh**();
		       return context;
		    }
		}
		```


	### **配置类示意图**


	parent context type : AnnotationConfigServletWebApplicationContext ：不允许bean 定义覆盖


	child context type:  AnnotationConfigApplicationContext ：允许bean 定义覆盖


	![Untitled.png](/images/f0cbf798dec8a9cebd117f8ebc93d747.png)


	子容器中有三种配置：全局默认配置，接口个性化配置，feignclient默认配置


	### **问题：**


	如果同时添加了全局和服务级别的配置，那会发生什么？


	1）启动报错 2）全局配置生效 3）服务级别的配置生效


	答案: 2）全局配置生效


	两个bean的类型和名字都是一样的，会不会报错取决于一个属性allowBeanDefinitionOverriding：是否允许bean定义进行覆盖


	父容器的allowBeanDefinitionOverriding是false，而子容器的allowBeanDefinitionOverriding是true


	所以在子容器中允许bean定义的覆盖


	在[**创建子容器加载配置**](/16e64052cea98131b9e3cd31d528bb7f)中，先加载的是接口个性化配置，后加载的是默认全局配置，所以全局配置会覆盖服务级别的配置


## **配置文件**


	application.properties 或 application.yml


	```yaml
	feign:
	  client:
	    defaultToProperties: false
	    config: # 对应FeignClientProperties类的config成员变量
	      default: # 全局配置
	        # 日志级别
	        logger-level: BASIC
	        # 超时时间
	        connect-timeout: 10000
	
				# 接口配置
	      order:
	        # 日志级别
	        logger-level: HEADERS
	        # 超时时间
	        connect-timeout: 8000
	      user:
	        # 日志级别
	        logger-level: FULL
	        # 超时时间
	        connect-timeout: 6000
	```


	属性绑定Properties类


	```java
	@ConfigurationProperties("feign.client") // 配置的前缀 feign.client
	public class FeignClientProperties {
	
	    // 以配置文件的为准
		private boolean defaultToProperties = true;
	
	    // 默认配置的名称 default
		private String defaultConfig = "default";
	
	    // 可以自定义多个配置 key为配置名称
		private Map<String, FeignClientConfiguration> config = new HashMap<>();
	
		/**
		 * Feign client configuration.
		 */
		//注意不要和官方配置类（FeignClient**s**Configuration）混淆 这只是一个用来封装的普通类
		public static class FeignClientConfiguration {
	
			private Logger.Level loggerLevel;  // 日志级别
	
			private Integer connectTimeout;  // 连接超时
	
			private Integer readTimeout;  // 读取超时
	
			private Class<Retryer> retryer;  // 重试
	
			private Class<ErrorDecoder> errorDecoder; // 错误解码器
	
			private List<Class<RequestInterceptor>> requestInterceptors;  // 拦截器
	
			private Boolean decode404;
	
			private Class<Decoder> decoder; // 解码器
	
			private Class<Encoder> encoder; // 编码器
	
			private Class<Contract> contract; // 契约
	    }
	}
	```


	### **配置类和配置文件的优先级**


	由于`private String defaultConfig = "default";`，所以默认以配置文件为准


	> ⚠️ 在使用配置文件配置的时候，先加载的是全局配置，后加载的是接口配置，所以服务级别的配置可以覆盖默认配置，与[**创建子容器加载配置**](/16e64052cea98131b9e3cd31d528bb7f)中相反


	```java
	class FeignClientFactoryBean
	implements FactoryBean < Object > , InitializingBean, ApplicationContextAware {
	    // ...
	
	    // 配置 feign
	    protected void configureFeign(FeignContext context, Feign.Builder builder) {
	        // 从配置文件获取（属性绑定）
	        FeignClientProperties properties = this.applicationContext
	            .getBean(FeignClientProperties.class);
	
	        if (properties != null) {
	            // 如果有配置文件有配置
	            if (properties.isDefaultToProperties()) {
	                // isDefaultToProperties默认为true 即默认以配置文件的配置为准
	                // 因此先通过配置类进行配置 然后通过配置文件进行配置
	                configureUsingConfiguration(context, builder);
	                // 对于配置文件而言 服务级别的配置可以覆盖默认配置
										//加载全局配置
	                configureUsingProperties(
	                    properties.getConfig().get(properties.getDefaultConfig()),
	                    builder);
										// 此contextId可以在@FeignClient注解属性中配置，也可以配置文件直接指定
										//加载接口配置
	                configureUsingProperties(properties.getConfig().get(this.contextId),
	                    builder);
	            } else {
	                // isDefaultToProperties如果设置为false 即默认以配置类的配置为准
	                // 因此先通过配置文件进行配置 然后通过配置类进行配置
	                configureUsingProperties(
	                    properties.getConfig().get(properties.getDefaultConfig()),
	                    builder);
										// 此contextId可以在@FeignClient注解属性中配置，也可以配置文件直接指定
	                configureUsingProperties(properties.getConfig().get(this.contextId),
	                    builder);
	                configureUsingConfiguration(context, builder);
	            }
	        } else {
	            // 如果配置文件没有配置则直接从配置类进行配置
	            configureUsingConfiguration(context, builder);
	        }
	    }
	
	    // 使用配置类进行配置
	    protected void configureUsingConfiguration(FeignContext context,
	        Feign.Builder builder) {
	        // 日志级别
	        Logger.Level level = getOptional(context, Logger.Level.class);
	        if (level != null) {
	            builder.logLevel(level);
	        }
	
	        // 重试器
	        Retryer retryer = getOptional(context, Retryer.class);
	        if (retryer != null) {
	            builder.retryer(retryer);
	        }
	
	        // 错误编码
	        ErrorDecoder errorDecoder = getOptional(context, ErrorDecoder.class);
	        if (errorDecoder != null) {
	            builder.errorDecoder(errorDecoder);
	        }
	
	        // 请求参数(连接超时 读取超时等)
	        Request.Options options = getOptional(context, Request.Options.class);
	        if (options != null) {
	            builder.options(options);
	        }
	
	        // 拦截器
	        Map < String, RequestInterceptor > requestInterceptors = context
	            .getInstances(this.contextId, RequestInterceptor.class);
	        if (requestInterceptors != null) {
	            builder.requestInterceptors(requestInterceptors.values());
	        }
	
	        QueryMapEncoder queryMapEncoder = getOptional(context, QueryMapEncoder.class);
	        if (queryMapEncoder != null) {
	            builder.queryMapEncoder(queryMapEncoder);
	        }
	
	        if (this.decode404) {
	            builder.decode404();
	        }
	    }
	
	    // 使用配置文件进行配置
	    protected void configureUsingProperties(
	        FeignClientProperties.FeignClientConfiguration config,
	        Feign.Builder builder) {
	        if (config == null) {
	            return;
	        }
	
	        // 日志级别
	        if (config.getLoggerLevel() != null) {
	            builder.logLevel(config.getLoggerLevel());
	        }
	
	        // 请求参数(连接超时 读取超时等)
	        if (config.getConnectTimeout() != null && config.getReadTimeout() != null) {
	            builder.options(new Request.Options(config.getConnectTimeout(),
	                config.getReadTimeout()));
	        }
	
	        // 重试器
	        if (config.getRetryer() != null) {
	            Retryer retryer = getOrInstantiate(config.getRetryer());
	            builder.retryer(retryer);
	        }
	
	        // 错误编码
	        if (config.getErrorDecoder() != null) {
	            ErrorDecoder errorDecoder = getOrInstantiate(config.getErrorDecoder());
	            builder.errorDecoder(errorDecoder);
	        }
	
	        // 拦截器
	        if (config.getRequestInterceptors() != null && !config.getRequestInterceptors().isEmpty()) {
	            for (Class < RequestInterceptor > bean: config.getRequestInterceptors()) {
	                RequestInterceptor interceptor = getOrInstantiate(bean);
	                builder.requestInterceptor(interceptor);
	            }
	        }
	
	        if (config.getDecode404() != null) {
	            if (config.getDecode404()) {
	                builder.decode404();
	            }
	        }
	
	        // 编码器
	        if (Objects.nonNull(config.getEncoder())) {
	            builder.encoder(getOrInstantiate(config.getEncoder()));
	        }
	
	        // 解码器
	        if (Objects.nonNull(config.getDecoder())) {
	            builder.decoder(getOrInstantiate(config.getDecoder()));
	        }
	
	        // 契约
	        if (Objects.nonNull(config.getContract())) {
	            builder.contract(getOrInstantiate(config.getContract()));
	        }
	    }
	
	    private < T > T getOrInstantiate(Class < T > tClass) {
	            try {
	                // 直接从spring父容器中取
	                return this.applicationContext.getBean(tClass);
	            } catch (NoSuchBeanDefinitionException e) {
	                return BeanUtils.instantiateClass(tClass);
	            }
	        }
	        // ...
	}
	```


## **具体配置举例讲解**


	### **请求拦截器**


		接口：


		```java
		public interface RequestInterceptor {
		  void apply(RequestTemplate template);
		}
		```


		调用拦截器：发送请求前


		作用：用于修改请求url, header, body等等


		```java
		final class SynchronousMethodHandler implements MethodHandler {
		
		   Request targetRequest(RequestTemplate template) {
		      // 调用拦截器
		      for (RequestInterceptor interceptor : requestInterceptors) {
		         interceptor.apply(template);
		      }
		      return target.apply(template);
		   }
		
			Object executeAndDecode(RequestTemplate template, Options options) throws Throwable {
		        // 把请求模板转换为具体的请求
		        Request request = targetRequest(template);
		
		        if (logLevel != Logger.Level.NONE) {
		          logger.logRequest(metadata.configKey(), logLevel, request);
		        }
		
		        Response response;
		        long start = System.nanoTime();
		        try {
		          // 发送请求
		          response = client.execute(request, options);
		        } catch (IOException e) {
		          if (logLevel != Logger.Level.NONE) {
		            logger.logIOException(metadata.configKey(), logLevel, e, elapsedTime(start));
		          }
		          throw errorExecuting(request, e);
		        }
		        long elapsedTime = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
				// ...
		    }
		}
		```


		获取拦截器组件: 从配置类或配置文件


		```java
		class FeignClientFactoryBean
				implements FactoryBean<Object>, InitializingBean, ApplicationContextAware {
		
		    // 使用配置类进行配置
			protected void configureUsingConfiguration(FeignContext context,
					Feign.Builder builder) {
				// ...
		
		        // 从spring容器获取组件
		        Map<String, RequestInterceptor> requestInterceptors = context
						.getInstances(this.contextId, RequestInterceptor.class);
		
		        // ...
			}
		
		    // 使用配置文件进行配置
			protected void configureUsingProperties(
					FeignClientProperties.FeignClientConfiguration config,
					Feign.Builder builder) {
				// ...
		
		        // 拦截器
				if (config.getRequestInterceptors() != null
						&& !config.getRequestInterceptors().isEmpty()) {
					for (Class<RequestInterceptor> bean : config.getRequestInterceptors()) {
						RequestInterceptor interceptor = getOrInstantiate(bean);
						builder.requestInterceptor(interceptor);
					}
				}
				// ...
			}
		}
		```


	### **问题一：**


	是否需要@Component注解？


	可以。加入@Component注解后，拦截器会被加入父容器。因为getBean的时候是先先找子容器再一直向上追溯查找，所以会扫描到拦截器。


	### **问题二：**


	拦截器是全局有效的吗？如果是，可否做到只对某个服务接口有效？


	可以做到。只需要在每个接口单独的配置类中配置该接口的拦截器，这样拦截器会被配置到每个接口的子容器中实现只对某个接口有效。


	但是需要注意的一点是，要在@ComponentScan中排除掉接口配置类所在的包，以防止spring扫描到拦截器并将其加入到父容器中导致专一性失效。这种情况下配置隔离失效。


	### **问题三：**


	拦截器是否可以自定义顺序？


	拦截器规定顺序的一些实现：提供拦截器order、提供registry类来配置拦截器等。


	OpenFrign没有提供这一方面的实现。


	但是我们可以通过代码中配置拦截器的代码顺序实现。因为配置类解析是有顺序的。


## Fourth

# **请求对象的构造（上）**


## **前三章节回顾**


	前三章的内容归纳起来就是讲了这样的问题：


	![Untitled.png](/images/3e0ba156960d2b606b961e3354283186.png)


	如何把接口转换为具有发送http请求能力的feign client对象以及如何整合到Spring容器中？


## **如何构造请求对象?**


	### **思路分析**


		### **Http请求对象的分析（目标）**


			URL: [http://127.0.0.1:9000/consumer/feign/order/](http://127.0.0.1:9000/consumer/feign/order/){1}?name=xxx&age=18


			协议: http


			IP端口: 127.0.0.1:9000 -> 注册中心获取


			URI: /consumer/feign/order/{id}


			路径参:  {1} (path variable)


			请求参：name=xxx,  age=18 (query)


			请求头:   headers


			请求体： body


			请求方法:   Get/Post/Put/Delete ...


			```text
			public final class Request {
			  private final HttpMethod httpMethod;
			  private final String url;
			  private final Map<String, Collection<String>> headers;
			  private final Body body;
			}
			```


		### **接口方法的分析（数据源）**


			方法本身的要素是否能表达所有Http请求的要素？


			方法的要素：


			方法名  ×


			参数(名称与类型) √


			返回值类型  ×


			URI -> 注解 或 Java对象（URI对象）表示


			请求方法 -> 注解


			路径参、请求参、请求头、请求体 -> 方法的入参 + 注解


		### **问题一：注解如何设计？**


			1）URI 和 请求方法可以合并在一个注解中


			2）对路径参、请求参、请求头、请求体分别设置对应的注解


			### **feign：**


			@RequestLine/@Param/@QueryMap/@HeaderMap/@Body


			### **open feign：**


			@RequestMapping/@PathVariable/@RequestParam/@SpringQueryMap/@RequestHeader/@RequestBody


			URI:  类的@RequestMapping + 方法的@RequestMapping


			请求方法： 方法的@RequestMapping


			路径参：参数的@PathVariable


			请求参：参数的@RequestParam + @SpringQueryMap


			请求头:  类的@RequestMapping(produce/consume/header)


			方法的@RequestMapping(produce/consume/header)


			参数的@RequestHeader


		### **问题二：为什么选择SpringMVC注解？**


			SpringMVC： http 请求 -> Java 对象


			open feign：Java 对象 -> http 请求


			对于方法和注解信息，可以封装在新的对象中 -> 方法元数据


		### **方法元数据的分析**

			1. 各种参数的位置（索引）

			2）参数名称，类型


			3）参数类型转换器


			4）编码信息


			```java
			public final class MethodMetadata implements Serializable {
			
			  private static final long serialVersionUID = 1L;
			  private String configKey;
			  private transient Type returnType;
			  private Integer urlIndex;
			  private Integer bodyIndex;
			  private Integer headerMapIndex;
			  private Integer queryMapIndex;
			  private boolean queryMapEncoded;
			  private transient Type bodyType;
			  private RequestTemplate template = new RequestTemplate();
			  private List<String> formParams = new ArrayList<String>();
			  private Map<Integer, Collection<String>> indexToName =
			      new LinkedHashMap<Integer, Collection<String>>();
			  private Map<Integer, Class<? extends Expander>> indexToExpanderClass =
			      new LinkedHashMap<Integer, Class<? extends Expander>>();
			  private Map<Integer, Boolean> indexToEncoded = new LinkedHashMap<Integer, Boolean>();
			  private transient Map<Integer, **Expander**> indexToExpander;
			}
			```


			Expander为参数类型转换器


			```java
			@Retention(RetentionPolicy.RUNTIME)
			@Target({ElementType.PARAMETER, ElementType.FIELD, ElementType.METHOD})
			public @interface Param {
			    String value() default "";
			
			    Class<? extends Expander> expander() default ToStringExpander.class;
			
			    /** @deprecated */
			    boolean encoded() default false;
			
			    public static final class ToStringExpander implements Expander {
			        public ToStringExpander() {
			        }
			
			        public String expand(Object value) {
			            return value.toString();
			        }
			    }
			
			    public interface Expander {
			        String expand(Object var1);
			    }
			}
			```


			只适用于路径参数、请求参数、header，因为这三个都转为字符串。但是body不可以。


		### **构造请求对象整体思路**


			![Untitled.png](/images/c47b815f81e5f59ba906f586ab74ab72.png)


			构建请求对象分两步走：


			1）解析方法和注解（类、方法、参数），并把信息封装到方法元数据中  → 应用启动


			2）结合方法元数据和实际参数，构建请求对象 → 方法调用


			实参的类型转换，编码，填充


			object[]是因为反射时invoke方法的参数。我们根据`MethodMetadata` 中的各种index数值，在数组中对应index的位置即可拿到请求参数的对象，构建request


		### **问题三：如何转换成方法元数据？**


			1）做成一个组件（Contract）


			```java
			public interface Contract {
			    // 解析接口的注解信息并封装为方法元数据的集合
			    List<MethodMetadata> parseAndValidatateMetadata(Class<?> targetType);
			}
			```


			![Untitled.png](/images/6604701ce299effe1cc0cdd63baef683.png)


			模板方法的设计模式


			接口  + 抽象实现 + 默认实现


			接口：提供扩展性 -> Contract


			抽象实现： 抽取公共逻辑 -> BaseContract


			默认实现：提供基本功能的使用 -> Default（Feign中的实现）,   SpringMvcContract（OpenFeign中的实现，因为其未使用Feign中的那一套注解）


			2）Contract组件从何获得？


			Springboot自动装配 + 从FeignContext获取


			```java
			@Configuration(proxyBeanMethods = false)
			public class FeignClientsConfiguration {
			
			    @Bean
			  @ConditionalOnMissingBean
			  public Contract feignContract(ConversionService feignConversionService) {
			    return new SpringMvcContract(this.parameterProcessors, feignConversionService);
			  }
			}
			```


	### **源码解读**


		### **BaseContract**


		解析注解的顺序：类 -> 方法 -> 参数


		```java
		abstract class BaseContract implements Contract {
		
		    /** 解析接口的注解信息并封装为方法元数据的集合 */
		    @Override
		    public List<MethodMetadata> parseAndValidatateMetadata(Class<?> targetType) {
		          // 接口不能带有泛型
		          checkState(targetType.getTypeParameters().length == 0, "Parameterized types unsupported: %s",
		              targetType.getSimpleName());
		
		          // 接口最多只能有一个父接口
		          checkState(targetType.getInterfaces().length <= 1, "Only single inheritance supported: %s",
		              targetType.getSimpleName());
		
		          // 如果传入的接口有一个父接口 那么该父接口必须是顶级接口
		          if (targetType.getInterfaces().length == 1) {
		            checkState(targetType.getInterfaces()[0].getInterfaces().length == 0,
		                "Only single-level inheritance supported: %s",
		                targetType.getSimpleName());
		          }
		
		          // 新建一个结果集容器
		          Map<String, MethodMetadata> result = new LinkedHashMap<String, MethodMetadata>();
		          // 获取所有public方法，包括从父接口继承而来的
		          for (Method method : targetType.getMethods()) {
		            // 排除掉从Object继承的方法，static方法，接口中的default方法
		            if (method.getDeclaringClass() == Object.class ||
		                (method.getModifiers() & Modifier.STATIC) != 0 ||
		                Util.isDefault(method)) {
		              continue;
		            }
		            // 把方法解析为方法元数据 【关键代码】
		            MethodMetadata metadata = parseAndValidateMetadata(targetType, method);
		            // 重写方法不支持
		            checkState(!result.containsKey(metadata.configKey()), "Overrides unsupported: %s",
		                metadata.configKey());
		            result.put(metadata.configKey(), metadata);
		          }
		          return new ArrayList<>(result.values());
		    }
		
		    /** 解析方法的注解并封装为方法元数据对象 */
		    protected MethodMetadata parseAndValidateMetadata(Class<?> targetType, Method method) {
		          // 创建MethodMetadata对象
		          MethodMetadata data = new MethodMetadata();
		
		          // 设置返回值
		          data.returnType(Types.resolve(targetType, targetType, method.getGenericReturnType()));
		
		          // 设置configKey,方法的唯一标识: 接口名#方法名(参数类型名称1,参数类型名称2)
		          data.configKey(Feign.configKey(targetType, method));
		
		          // 如果有父接口先处理父接口
		          if (targetType.getInterfaces().length == 1) {
		            processAnnotationOnClass(data, targetType.getInterfaces()[0]);
		          }
		          // 再处理当前接口 【关键代码】
		          processAnnotationOnClass(data, targetType);
		
		          // 处理方法的注解 【关键代码】
		          for (Annotation methodAnnotation : method.getAnnotations()) {
		            processAnnotationOnMethod(data, methodAnnotation, method);
		          }
		
		          // 只支持GET POST等http方法
		          checkState(data.template().method() != null,
		              "Method %s not annotated with HTTP method type (ex. GET, POST)",
		              method.getName());
		
		      // 获取参数原始类型
		          Class<?>[] parameterTypes = method.getParameterTypes();
		          // 获取参数通用类型
		          Type[] genericParameterTypes = method.getGenericParameterTypes();
		          // 获取参数注解 二维数组:因为可以有多个参数 每个参数有多个注解
		          Annotation[][] parameterAnnotations = method.getParameterAnnotations();
		
		          int count = parameterAnnotations.length;
		          for (int i = 0; i < count; i++) {
		            boolean isHttpAnnotation = false;
		            if (parameterAnnotations[i] != null) {
		               // 处理每个参数的注解 如果其中有一个注解属于http注解 则isHttpAnnotation为true
		               // 哪些属于http注解？如SpringMVC的@RequestHeader @PathVariable @RequestParam @SpringQueryMap
		               //【关键代码】
		               isHttpAnnotation = processAnnotationsOnParameter(data, parameterAnnotations[i], i);
		            }
		
		            if (parameterTypes[i] == URI.class) {
		               data.urlIndex(i);
		            } else if (!isHttpAnnotation && parameterTypes[i] != Request.Options.class) {
		               // 参数类型不是URI或Options 也没有加http注解 则该参数判定为body
		               checkState(data.formParams().isEmpty(),
		                  "Body parameters cannot be used with form parameters.");
		               checkState(data.bodyIndex() == null, "Method has too many Body parameters: %s", method);
		               // 设置body的位置和类型【关键代码】
		               data.bodyIndex(i);
		               data.bodyType(Types.resolve(targetType, targetType, genericParameterTypes[i]));
		            }
		          }
		
		          // ...
		
		          return data;
		    }
		
		  /** 处理类上的注解 */
		    protected abstract void processAnnotationOnClass(MethodMetadata data, Class<?> clz);
		
		  /** 处理方法上的注解 */
		    protected abstract void processAnnotationOnMethod(MethodMetadata data, Annotation annotation, Method method);
		
		  /** 处理参数上的注解 */
		    protected abstract boolean processAnnotationsOnParameter(MethodMetadata data, Annotation[] annotations, int paramIndex);
		  }
		```


		> ⚠️ 参数类型不是URI或Options 也没有加http注解 则该参数判定为body → 不加@RequestBody也会被认定为body


		http注解有：@PathVariable @SpringQueryMap @RequestHeader @RequestParam


		### **SpringMvcContract**


		类：@RequestMapping


		方法：@RequestMapping


		参数：@PathVariable @SpringQueryMap @RequestHeader @RequestParam


		@RequestMapping


		```java
		@Target({ElementType.TYPE, ElementType.METHOD})
		@Retention(RetentionPolicy.RUNTIME)
		@Documented
		@Mapping
		public @interface RequestMapping {
		
		   @AliasFor("path")
		   String[] value() default {};
		
		   @AliasFor("value")
		   String[] path() default {};
		
		   /**
		    * The HTTP request methods to map to, narrowing the primary mapping:
		    * GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE, TRACE.
		    */
		   RequestMethod[] method() default {};
		
		   String[] params() default {};
		
		   String[] headers() default {};
		
		   /**
		    * header的Content-Type
		    */
		   String[] consumes() default {};
		
		   /**
		  * header的Accept
		    */
		   String[] produces() default {};
		
		}
		```


		```java
		public class SpringMvcContract extends Contract.BaseContract implements ResourceLoaderAware {
		
		  private static final String ACCEPT = "Accept";
		
		  private static final String CONTENT_TYPE = "Content-Type";
		
		  private static final TypeDescriptor STRING_TYPE_DESCRIPTOR = TypeDescriptor
		      .valueOf(String.class);
		
		  private static final TypeDescriptor ITERABLE_TYPE_DESCRIPTOR = TypeDescriptor
		      .valueOf(Iterable.class);
		
		  private static final ParameterNameDiscoverer PARAMETER_NAME_DISCOVERER = new DefaultParameterNameDiscoverer();
		
		    // 参数处理器 可以自动装配也可以使用默认的处理器
		  private final Map<Class<? extends Annotation>, AnnotatedParameterProcessor> annotatedArgumentProcessors;
		
		  private final Map<String, Method> processedMethods = new HashMap<>();
		
		  private final ConversionService conversionService;
		
		  private final ConvertingExpanderFactory convertingExpanderFactory;
		
		  private ResourceLoader resourceLoader = new DefaultResourceLoader();
		
		  public SpringMvcContract(
		      List<AnnotatedParameterProcessor> annotatedParameterProcessors,
		      ConversionService conversionService) {
		    Assert.notNull(annotatedParameterProcessors,
		        "Parameter processors can not be null.");
		    Assert.notNull(conversionService, "ConversionService can not be null.");
		
		        // 初始化参数处理器
		    List<AnnotatedParameterProcessor> processors;
		    if (!annotatedParameterProcessors.isEmpty()) {
		      processors = new ArrayList<>(annotatedParameterProcessors);
		    }
		    else {
		      processors = getDefaultAnnotatedArgumentsProcessors();
		    }
		    this.annotatedArgumentProcessors = toAnnotatedArgumentProcessorMap(processors);
		
		        // 创建参数转换器工厂 真正的转换功能来自conversionService
		    this.conversionService = conversionService;
		    this.convertingExpanderFactory = new ConvertingExpanderFactory(conversionService);
		  }
		
		    /** 获取默认处理器 */
		  private List<AnnotatedParameterProcessor> getDefaultAnnotatedArgumentsProcessors() {
		
		    List<AnnotatedParameterProcessor> annotatedArgumentResolvers = new ArrayList<>();
		    annotatedArgumentResolvers.add(new PathVariableParameterProcessor()); // 处理@PathVavirable
		    annotatedArgumentResolvers.add(new RequestParamParameterProcessor()); // 处理@RequestParam
		    annotatedArgumentResolvers.add(new RequestHeaderParameterProcessor()); // 处理@RequestHeader
		    annotatedArgumentResolvers.add(new QueryMapParameterProcessor()); // 处理@SpringQueryMap
		    return annotatedArgumentResolvers;
		  }
		
		    @Override
		  public MethodMetadata parseAndValidateMetadata(Class<?> targetType, Method method) {
		        // 方法先放入缓存中 表示已经处理
		    this.processedMethods.put(Feign.configKey(targetType, method), method);
		
		        // 调用父类的parseAndValidateMetadata
		    MethodMetadata md = super.parseAndValidateMetadata(targetType, method);
		
		        // 处理类上的RequestMapping注解
		        // 因为RequestMapping注解可以加在类上和方法上 两者中注解值有优先级问题
		    RequestMapping classAnnotation = findMergedAnnotation(targetType,
		        RequestMapping.class);
		    if (classAnnotation != null) {
		      // 解析header中的produces
		            // 此时可能已经从方法的RequestMapping注解获得produces的值
		            // 这样处理表示方法上的RequestMapping注解优先于类上的RequestMapping注解
		      if (!md.template().headers().containsKey(ACCEPT)) {
		        parseProduces(md, method, classAnnotation);
		      }
		
		      // 解析header中的consumes 原理同produces
		      if (!md.template().headers().containsKey(CONTENT_TYPE)) {
		        parseConsumes(md, method, classAnnotation);
		      }
		
		      // 解析headers
		      parseHeaders(md, method, classAnnotation);
		    }
		    return md;
		  }
		
		    /** 处理类上的注解(RequestMapping) */
		  @Override
		  protected void processAnnotationOnClass(MethodMetadata data, Class<?> clz) {
		    if (clz.getInterfaces().length == 0) {
		      RequestMapping classAnnotation = findMergedAnnotation(clz,
		          RequestMapping.class);
		            // 这里只处理类上RequestMapping的path,
		            // 其他produces, consumes, headers放在解析方法上的RequestMapping注解之后
		      if (classAnnotation != null) {
		        // 如果类上的@RequestMapping有value(path) 处理后放入uri中
		        if (classAnnotation.value().length > 0) {
		          String pathValue = emptyToNull(classAnnotation.value()[0]);
		                    // 解析path中的${}
		          pathValue = resolve(pathValue);
		                    // 保证uri以/开头
		          if (!pathValue.startsWith("/")) {
		            pathValue = "/" + pathValue;
		          }
		                    // 放入uri中
		          data.template().uri(pathValue);
		        }
		      }
		    }
		  }
		
		  /** 处理方法上的注解(RequestMapping) */
		  @Override
		  protected void processAnnotationOnMethod(MethodMetadata data,
		      Annotation methodAnnotation, Method method) {
		        // 如果不是@RequestMapping注解本身 也不带有@RequestMapping注解的话就返回
		    if (!RequestMapping.class.isInstance(methodAnnotation) && !methodAnnotation
		        .annotationType().isAnnotationPresent(RequestMapping.class)) {
		      return;
		    }
		
		    RequestMapping methodMapping = findMergedAnnotation(method, RequestMapping.class);
		    // 解析HTTP Method
		    RequestMethod[] methods = methodMapping.method();
		    if (methods.length == 0) {
		      methods = new RequestMethod[] { RequestMethod.GET };
		    }
		    checkOne(method, methods, "method");
		    data.template().method(Request.HttpMethod.valueOf(methods[0].name()));
		
		    // 解析path
		    checkAtMostOne(method, methodMapping.value(), "value");
		    if (methodMapping.value().length > 0) {
		      String pathValue = emptyToNull(methodMapping.value()[0]);
		      if (pathValue != null) {
		        pathValue = resolve(pathValue);
		        if (!pathValue.startsWith("/") && !data.template().path().endsWith("/")) {
		          pathValue = "/" + pathValue;
		        }
		        data.template().uri(pathValue, true);
		      }
		    }
		
		    // 解析header中的produces
		    parseProduces(data, method, methodMapping);
		
		    // 解析header中的consumes
		    parseConsumes(data, method, methodMapping);
		
		    // 解析headers
		    parseHeaders(data, method, methodMapping);
		
		    data.indexToExpander(new LinkedHashMap<Integer, Param.Expander>());
		  }
		
		  /** 处理参数上的注解 */
		  @Override
		  protected boolean processAnnotationsOnParameter(MethodMetadata data,
		      Annotation[] annotations, int paramIndex) {
		    boolean isHttpAnnotation = false;
		
		    AnnotatedParameterProcessor.AnnotatedParameterContext context = new SimpleAnnotatedParameterContext(
		        data, paramIndex);
		    Method method = this.processedMethods.get(data.configKey());
		    for (Annotation parameterAnnotation : annotations) {
		            // 根据参数注解类型获取对应的参数处理器
		      AnnotatedParameterProcessor processor = this.annotatedArgumentProcessors
		          .get(parameterAnnotation.annotationType());
		      if (processor != null) {
		        Annotation processParameterAnnotation;
		        processParameterAnnotation = synthesizeWithMethodParameterNameAsFallbackValue(
		            parameterAnnotation, method, paramIndex);
		                // 参数处理器处理【关键代码】
		        isHttpAnnotation |= processor.processArgument(context,
		            processParameterAnnotation, method);
		      }
		    }
		
		        // 如果是http注解并且没有对应的expander
		        // 什么expander -> 参数转换器
		    if (isHttpAnnotation && data.indexToExpander().get(paramIndex) == null) {
		      TypeDescriptor typeDescriptor = createTypeDescriptor(method, paramIndex);
		      if (this.conversionService.canConvert(typeDescriptor,
		          STRING_TYPE_DESCRIPTOR)) {
		        Param.Expander expander = this.convertingExpanderFactory
		            .getExpander(typeDescriptor);
		        if (expander != null) {
		          data.indexToExpander().put(paramIndex, expander);
		        }
		      }
		    }
		    return isHttpAnnotation;
		  }
		    // ...
		}
		```


		### **AnnotatedParameterProcessor**


		PathVariableParameterProcessor：@PathVariable 解析路径参数


		QueryMapParameterProcessor: @SpringQueryMap 解析请求参数


		RequestHeaderParameterProcessor: @RequestHeader 解析请求头


		RequestParamParameterProcessor：@RequestParam 解析请求参数


		QueryMapParameterProcessor 与 RequestParamParameterProcessor的区别：


		前者可以解析自定义实体对象，Map和基本类型，没有特别的限制


		后者只能解析Map和基本类型不能解析自定义对象类型


		### **QueryMapParameterProcessor**


		```java
		public class QueryMapParameterProcessor implements AnnotatedParameterProcessor {
		
		  private static final Class<SpringQueryMap> ANNOTATION = SpringQueryMap.class;
		
		  @Override
		  public Class<? extends Annotation> getAnnotationType() {
		    return ANNOTATION;
		  }
		
		  @Override
		  public boolean processArgument(AnnotatedParameterContext context,
		      Annotation annotation, Method method) {
		    int paramIndex = context.getParameterIndex();
		    MethodMetadata metadata = context.getMethodMetadata();
		        // 对@SpringQueryMap注解所对应的参数的类型没有限制
		    if (metadata.queryMapIndex() == null) {
		      metadata.queryMapIndex(paramIndex);
		      metadata.queryMapEncoded(SpringQueryMap.class.cast(annotation).encoded());
		    }
		    return true;
		  }
		}
		```


		### **RequestParamParameterProcessor**


		```java
		public class RequestParamParameterProcessor implements AnnotatedParameterProcessor {
		
			private static final Class<RequestParam> ANNOTATION = RequestParam.class;
		
			@Override
			public Class<? extends Annotation> getAnnotationType() {
				return ANNOTATION;
			}
		
			@Override
			public boolean processArgument(AnnotatedParameterContext context,
					Annotation annotation, Method method) {
				int parameterIndex = context.getParameterIndex();
				Class<?> parameterType = method.getParameterTypes()[parameterIndex];
				MethodMetadata data = context.getMethodMetadata();
		
		        // 参数必须是Map类型 否则不可以成为QueryMap
				if (Map.class.isAssignableFrom(parameterType)) {
					checkState(data.queryMapIndex() == null,
							"Query map can only be present once.");
					data.queryMapIndex(parameterIndex);
		
					return true;
				}
		
				RequestParam requestParam = ANNOTATION.cast(annotation);
				String name = requestParam.value();
				checkState(emptyToNull(name) != null,
						"RequestParam.value() was empty on parameter %s", parameterIndex);
				context.setParameterName(name);
		
				Collection<String> query = context.setTemplateParameter(name,
						data.template().queries().get(name));
				data.template().query(name, query);
				return true;
			}
		}
		```


		实参类型转换和填充


		```text
		interface Expander {
		
		    /**
		     * Expands the value into a string. Does not accept or return null.
		     */
		    String expand(Object value);
		}
		```


		```text
		public class SpringMvcContract extends Contract.BaseContract implements ResourceLoaderAware {
		
		    private static final TypeDescriptor STRING_TYPE_DESCRIPTOR = TypeDescriptor
					.valueOf(String.class);
		
			private static class ConvertingExpanderFactory {
		
				private final ConversionService conversionService;
		
				ConvertingExpanderFactory(ConversionService conversionService) {
					this.conversionService = conversionService;
				}
		
				Param.Expander getExpander(TypeDescriptor typeDescriptor) {
					return value -> {
						Object converted = this.conversionService.convert(value, typeDescriptor,
								STRING_TYPE_DESCRIPTOR);
						return (String) converted;
					};
				}
		
			}
		}
		```


		Java 中的所有类型
		raw type：原始类型，对应 Class
		即我们通常说的引用类型，包括普通的类，例如 String.class、List.class
		也包括数组(Array.class)、接口(Cloneable.class)、注解(Annotation.class)、枚举(Enum.class)等
		primitive types：基本类型，对应 Class
		包括 Built-in 内置类型，例如 int.class、char.class、void.class
		也包括 Wrappers 内置类型包装类型，例如 Integer.class、Boolean.class、Void.class
		parameterized types：参数化类型，对应 ParameterizedType
		带有类型参数的类型，即常说的泛型，例如 List<T>、Map<Integer, String>、List<? extends Number>
		实现类 sun.reflect.generics.reflectiveObjects.ParameterizedTypeImpl
		type variables：类型变量类型，对应 TypeVariable<D>
		即参数化类型 ParameterizedType 中的 E、K 等类型变量，表示泛指任何类
		实现类 sun.reflect.generics.reflectiveObjects.TypeVariableImpl
		array types：泛型数组类型，对应 GenericArrayType
		元素类型是参数化类型或者类型变量的泛型数组类型，例如 T[]
		实现类 sun.reflect.generics.reflectiveObjects.GenericArrayTypeImpl
		Type 接口的另一个子接口 WildcardType 代表通配符表达式类型，或泛型表达式类型，比如?、? super T、? extends T，他并不是 Java 类型中的一种。


		```text
		private static class BuildTemplateByResolvingArgs implements RequestTemplate.Factory {
		
		    private final QueryMapEncoder queryMapEncoder;
		
		    protected final MethodMetadata metadata;
		    private final Map<Integer, Expander> indexToExpander = new LinkedHashMap<Integer, Expander>();
		
		    /** 通过metadata信息和实参创建RequestTemplate */
		    @Override
		    public RequestTemplate create(Object[] argv) {
		
		      // 把metadata中的半成品template拷贝一份
		      RequestTemplate mutable = RequestTemplate.from(metadata.template());
		
		      // 处理URI对象
		      if (metadata.urlIndex() != null) {
		        int urlIndex = metadata.urlIndex();
		        checkArgument(argv[urlIndex] != null, "URI parameter %s was null", urlIndex);
		        mutable.target(String.valueOf(argv[urlIndex]));
		      }
		
		      //
		      Map<String, Object> varBuilder = new LinkedHashMap<String, Object>();
		      for (Entry<Integer, Collection<String>> entry : metadata.indexToName().entrySet()) {
		        int i = entry.getKey();
		        Object value = argv[entry.getKey()];
		        if (value != null) { // Null values are skipped.
		          if (indexToExpander.containsKey(i)) {
		            value = expandElements(indexToExpander.get(i), value);
		          }
		          for (String name : entry.getValue()) {
		            varBuilder.put(name, value);
		          }
		        }
		      }
		
		      RequestTemplate template = resolve(argv, mutable, varBuilder);
		
		      // 处理queryMap
		      if (metadata.queryMapIndex() != null) {
		        // add query map parameters after initial resolve so that they take
		        // precedence over any predefined values
		        Object value = argv[metadata.queryMapIndex()];
		        Map<String, Object> queryMap = toQueryMap(value);
		        template = addQueryMapQueryParameters(queryMap, template);
		      }
		
		      // 处理headerMap
		      if (metadata.headerMapIndex() != null) {
		        template =
		            addHeaderMapHeaders((Map<String, Object>) argv[metadata.headerMapIndex()], template);
		      }
		
		      return template;
		    }
		
		
		    @SuppressWarnings("unchecked")
		    private RequestTemplate addHeaderMapHeaders(Map<String, Object> headerMap,
		                                                RequestTemplate mutable) {
		      for (Entry<String, Object> currEntry : headerMap.entrySet()) {
		        Collection<String> values = new ArrayList<String>();
		
		        Object currValue = currEntry.getValue();
		        if (currValue instanceof Iterable<?>) {
		          Iterator<?> iter = ((Iterable<?>) currValue).iterator();
		          while (iter.hasNext()) {
		            Object nextObject = iter.next();
		            values.add(nextObject == null ? null : nextObject.toString());
		          }
		        } else {
		          values.add(currValue == null ? null : currValue.toString());
		        }
		
		        mutable.header(currEntry.getKey(), values);
		      }
		      return mutable;
		    }
		
		    @SuppressWarnings("unchecked")
		    private RequestTemplate addQueryMapQueryParameters(Map<String, Object> queryMap,
		                                                       RequestTemplate mutable) {
		      for (Entry<String, Object> currEntry : queryMap.entrySet()) {
		        Collection<String> values = new ArrayList<String>();
		
		        boolean encoded = metadata.queryMapEncoded();
		        Object currValue = currEntry.getValue();
		        if (currValue instanceof Iterable<?>) {
		          Iterator<?> iter = ((Iterable<?>) currValue).iterator();
		          while (iter.hasNext()) {
		            Object nextObject = iter.next();
		            values.add(nextObject == null ? null
		                : encoded ? nextObject.toString()
		                    : UriUtils.encode(nextObject.toString()));
		          }
		        } else {
		          values.add(currValue == null ? null
		              : encoded ? currValue.toString() : UriUtils.encode(currValue.toString()));
		        }
		
		        mutable.query(encoded ? currEntry.getKey() : UriUtils.encode(currEntry.getKey()), values);
		      }
		      return mutable;
		    }
		
		    // ...
		}
		```

