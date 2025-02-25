FROM java:8
LABEL "author"="tl"
RUN mkdir /datart
COPY ./bin/* /datart/bin/
COPY ./config/* /datart/config/
COPY ./lib/* /datart/lib/
EXPOSE 58080
WORKDIR /datart
ENTRYPOINT java -cp "lib/*" datart.DatartServerApplication